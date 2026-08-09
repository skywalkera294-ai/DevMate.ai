import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsString()
  repoUrl?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsString()
  repoUrl?: string;
}

export class AddFileDto {
  @IsString()
  path!: string;

  @IsString()
  content!: string;
}

export class ImportRepoDto {
  @IsString()
  repo!: string; // e.g. "owner/repo"
  @IsOptional()
  @IsString()
  branch?: string;
}
