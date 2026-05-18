import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { BetSide } from "@prisma/client";

export class PlaceBetDto {
  @IsString() marketId!: string;
  @IsString() runnerId!: string;
  @IsEnum(BetSide) side!: BetSide;
  @IsNumber() @Min(1.01) @Max(1000) odds!: number;
  @IsNumber() @Min(1)    @Max(10_000_000) stake!: number;
  @IsOptional() @IsInt() fancyValue?: number;
}
