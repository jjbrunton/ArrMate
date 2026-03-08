export class ArrApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public url: string,
  ) {
    super(`Arr API error ${statusCode}: ${message} (${url})`);
    this.name = "ArrApiError";
  }
}

export class ArrConnectionError extends Error {
  constructor(
    message: string,
    public url: string,
    public cause?: Error,
  ) {
    super(`Arr connection error: ${message} (${url})`);
    this.name = "ArrConnectionError";
  }
}
