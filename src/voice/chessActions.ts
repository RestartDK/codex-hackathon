import { z } from "zod";

export const squareSchema = z.templateLiteral([
  z.enum(["a", "b", "c", "d", "e", "f", "g", "h"]),
  z.enum(["1", "2", "3", "4", "5", "6", "7", "8"]),
]);

export const moveArgumentsSchema = z.object({
  from: squareSchema.nullable(),
  to: squareSchema,
  piece: z.enum(["pawn", "knight", "bishop", "rook", "queen", "king"]).nullable(),
  promotion: z.enum(["queen", "rook", "bishop", "knight"]).nullable(),
});
