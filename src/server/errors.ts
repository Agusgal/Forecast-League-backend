export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export function invariant(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new ApiFailure(status, message);
}
