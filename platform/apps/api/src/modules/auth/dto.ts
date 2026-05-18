import { IsOptional, IsString, MaxLength, MinLength, Matches } from "class-validator";

export class RegisterDto {
  @IsString() @MinLength(3) @MaxLength(32)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "username may contain letters, digits, dot, underscore, hyphen" })
  username!: string;

  @IsString() @MinLength(8) @MaxLength(64)
  password!: string;

  @IsOptional() @IsString() @MaxLength(120)
  email?: string;

  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;
}

export class LoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() otp?: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class EnableTwoFaDto {
  @IsString() otp!: string;
}
