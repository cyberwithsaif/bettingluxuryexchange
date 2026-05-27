import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { UserStatus } from "@prisma/client";

// ── Admin → Bookie management ───────────────────────────────────────────────

export class CreateBookieDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  /** Minted into the bookie's wallet on creation (admin float). */
  @IsOptional() @IsNumber() @Min(0) initialBalance?: number;
  /** Commission in basis points (100 = 1%). */
  @IsOptional() @IsInt() @Min(0) @Max(10_000) commissionBps?: number;
  /** Credit facility — wallet may go negative down to -creditLimit. */
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
}

export class UpdateBookieDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) commissionBps?: number;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
}

/** Admin add (+) / deduct (-) of a bookie's wallet float. */
export class RechargeDto {
  @IsNumber() amount!: number;
  @IsOptional() @IsString() note?: string;
}

export class SetStatusDto { @IsIn(["ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"]) status!: UserStatus; }

// ── Bookie → User management ────────────────────────────────────────────────

export class CreateBookieUserDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  /** Funded from the bookie's wallet (deducted automatically). */
  @IsOptional() @IsNumber() @Min(0) initialBalance?: number;
  @IsOptional() @IsNumber() @Min(0) minStake?: number;
  @IsOptional() @IsNumber() @Min(0) maxStake?: number;
}

/** Move money between the bookie wallet and one of their users. */
export class TransferDto {
  @IsString() userId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  /** "credit" = bookie → user, "debit" = user → bookie. */
  @IsIn(["credit", "debit"]) direction!: "credit" | "debit";
}
