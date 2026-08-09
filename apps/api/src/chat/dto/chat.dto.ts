import { IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MaxLength(2000)
  query!: string;
}
