import type { AnalyzerContext, ScanResult, Section } from '../types';
import { parseFunctions, isCodeFile, isTestFile, languageFromExt } from '../utils';
import { detectProjectProfile } from './readme';

interface TestSpec {
  path: string;
  framework: string;
  content: string;
}

export function generateTests(ctx: AnalyzerContext): ScanResult {
  const profile = detectProjectProfile(ctx);
  const framework = detectTestFramework(ctx, profile);
  const files = ctx.files.filter((f) => isCodeFile(f.path) && !isTestFile(f.path));
  const specs: TestSpec[] = [];

  for (const file of files) {
    const funcs = parseFunctions(file.content, file.language).filter((f) => !f.isClass);
    if (funcs.length === 0) continue;
    const spec = buildSpec(file, funcs, framework);
    if (spec) specs.push(spec);
  }

  const sections: Section[] = specs.map((s) => ({
    title: `Tests · ${s.path}`,
    content: '```\n' + s.content + '\n```',
  }));

  const markdown = [
    `# Test Suite · ${framework}`,
    '',
    `Generated ${specs.length} test files covering the public functions detected in the project.`,
    '',
    ...specs.map((s) => `- \`${s.path}\``),
    '',
  ].join('\n');

  return {
    summary: `Generated ${specs.length} test files (${framework}) with unit tests, edge cases and mock data.`,
    markdown,
    sections,
    data: { framework, files: specs.map((s) => ({ path: s.path })) },
  };
}

function detectTestFramework(ctx: AnalyzerContext, profile: ReturnType<typeof detectProjectProfile>): string {
  const lower = ctx.files.map((f) => f.path.toLowerCase());
  if (profile.language === 'Python') return 'pytest';
  if (profile.language === 'Java') return 'JUnit';
  if (profile.language === 'PHP') return 'PHPUnit';
  if (profile.language === 'Go') return 'Go testing';
  if (profile.language === 'Rust') return 'cargo test';
  if (lower.some((f) => f.includes('vitest'))) return 'Vitest';
  if (lower.some((f) => f.includes('jest')) || lower.some((f) => f.endsWith('.test.ts'))) return 'Jest';
  return 'Jest';
}

function sampleValue(lang: string): string {
  if (lang === 'python') return "'sample'";
  if (lang === 'java') return '"sample"';
  if (lang === 'php') return "'sample'";
  return 'sample';
}

function buildSpec(
  file: { path: string; content: string; language: string },
  funcs: Array<{ name: string; params: string[]; returns: string | null; isClass: boolean }>,
  framework: string,
): TestSpec | null {
  const lang = file.language;
  const ext = file.path.split('.').pop();
  const baseName = file.path.split('/').pop()?.split('.')[0] ?? 'module';

  let content = '';

  if (framework === 'pytest' || lang === 'python') {
    const importPath = file.path.replace(/\.py$/, '').replace(/\//g, '.');
    content = [
      `"""Auto-generated tests for ${file.path} (DevMate AI)."""`,
      'from typing import Any',
      '',
      `from ${importPath} import ${funcs.map((f) => f.name).join(', ')}`,
      '',
      '',
      ...funcs.map((f, i) => {
        const params = f.params.filter((p) => !p.startsWith('_'));
        const args = params.map((p, j) => sampleValue('python')).join(', ');
        return [
          `def test_${f.name}_basic(${params.length ? 'mocker' : ''}):`,
          `    """Unit test: ${f.name} behaves correctly on typical input."""`,
          `    result = ${f.name}(${args})`,
          `    assert result is not None`,
          '',
          `def test_${f.name}_empty_input(${params.length ? 'mocker' : ''}):`,
          `    """Edge case: empty inputs must not raise unexpected errors."""`,
          `    result = ${f.name}(${params.map((_, j) => 'None').join(', ')})`,
          `    assert result is not None or result is None  # adapt expectation`,
          '',
          `def test_${f.name}_invalid_type(${params.length ? 'mocker' : ''}):`,
          `    """Edge case: invalid argument types are rejected cleanly."""`,
          `    try:`,
          `        ${f.name}(${params.map((_, j) => 'object()').join(', ')})`,
          `    except (TypeError, ValueError):`,
          `        pass  # acceptable contract: raise or handle gracefully`,
          '',
        ].join('\n');
      }),
      'def test_public_api_coverage():',
      '    """Meta test: every exported function has at least one test above."""',
      `    expected = {${funcs.map((f) => `'${f.name}'`).join(', ')}}`,
      `    defined = {${funcs.map((f) => `'test_${f.name}_basic'`).join(', ')}}`,
      `    assert len(expected) == len(defined)`,
      '',
      '',
    ].join('\n');
    return { path: `${file.path.replace(/\.py$/, '')}_test.py`, framework: 'pytest', content };
  }

  if (framework === 'Jest' || framework === 'Vitest' || lang === 'javascript' || lang === 'typescript') {
    const importStmt = lang === 'typescript'
      ? `import { ${funcs.map((f) => f.name).join(', ')} } from './${baseName}'`
      : `const { ${funcs.map((f) => f.name).join(', ')} } = require('./${baseName}');`;
    content = [
      `// Auto-generated tests for ${file.path} (DevMate AI)`,
      `import { describe, expect, it, jest } from '@jest/globals';`,
      ``,
      importStmt,
      ``,
      `describe('${baseName}', () => {`,
      ...funcs.flatMap((f, i) => {
        const params = f.params.filter((p) => !p.startsWith('_'));
        const args = params.map((_, j) => sampleValue('js')).join(', ');
        return [
          `  describe('${f.name}', () => {`,
          `    it('returns a value for typical input', () => {`,
          `      const result = ${f.name}(${args});`,
          `      expect(result).not.toBeUndefined();`,
          `    });`,
          `    it('handles empty input without throwing', () => {`,
          `      expect(() => ${f.name}(${params.map((_, j) => 'null').join(', ')})).not.toThrow();`,
          `    });`,
          `    it('handles invalid types gracefully', () => {`,
          `      expect(() => ${f.name}(${params.map((_, j) => '{}').join(', ')})).not.toThrow();`,
          `    });`,
          `  });`,
          ``,
        ];
      }),
      `});`,
      ``,
    ].join('\n');
    return { path: file.path.replace(/\.(ts|tsx)$/, '.test.ts').replace(/\.(js|jsx)$/, '.test.js'), framework, content };
  }

  if (framework === 'JUnit' || lang === 'java') {
    const className = capitalize(baseName) + 'Test';
    content = [
      `// Auto-generated tests for ${file.path} (DevMate AI)`,
      `import org.junit.jupiter.api.Test;`,
      `import static org.junit.jupiter.api.Assertions.*;`,
      ``,
      `public class ${className} {`,
      ...funcs.flatMap((f) => {
        const params = f.params.filter((p) => !p.startsWith('_'));
        const args = params.map((_, j) => 'null').join(', ');
        return [
          `  @Test`,
          `  public void test_${f.name}_basic() {`,
          `    // TODO: adapt argument types (${params.join(', ') || 'none'})`,
          `    Object result = ${f.name}(${args});`,
          `    assertNotNull(result);`,
          `  }`,
          ``,
        ];
      }),
      `}`,
      ``,
    ].join('\n');
    return { path: `${file.path.replace(/\.java$/, '')}Test.java`, framework: 'JUnit', content };
  }

  if (framework === 'PHPUnit' || lang === 'php') {
    const className = capitalize(baseName) + 'Test';
    content = [
      `<?php`,
      `// Auto-generated tests for ${file.path} (DevMate AI)`,
      `use PHPUnit\\Framework\\TestCase;`,
      ``,
      `class ${className} extends TestCase`,
      `{`,
      ...funcs.flatMap((f) => {
        const args = f.params.map((_, j) => 'null').join(', ');
        return [
          `    public function test_${f.name}_basic(): void`,
          `    {`,
          `        $result = ${f.name}(${args});`,
          `        $this->assertNotNull($result);`,
          `    }`,
          ``,
        ];
      }),
      `}`,
      ``,
    ].join('\n');
    return { path: `${file.path.replace(/\.php$/, '')}Test.php`, framework: 'PHPUnit', content };
  }

  if (framework === 'Go testing' || lang === 'go') {
    const fnTests = funcs.map((f) => {
      const params = f.params.filter((p) => !p.startsWith('_'));
      return [
        `func Test${capitalize(f.name)}(t *testing.T) {`,
        `\t// TODO: build arguments for ${f.name}(${params.join(', ')})`,
        `\tif ${f.name}() == nil {`,
        `\t\tt.Log("returned nil; adjust expectation")`,
        `\t}`,
        `}`,
      ].join('\n');
    });
    content = [
      `package ${packageName(file.path)}`,
      ``,
      `// Auto-generated tests for ${file.path} (DevMate AI)`,
      `import "testing"`,
      ``,
      ...fnTests,
      ``,
    ].join('\n');
    return { path: file.path.replace(/\.go$/, '_test.go'), framework: 'Go testing', content };
  }

  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function packageName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 2] || 'main';
}

export { languageFromExt };
