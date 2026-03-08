export class OverseerrApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public url: string,
  ) {
    super(`Overseerr API error ${statusCode}: ${message} (${url})`);
    this.name = "OverseerrApiError";
  }
}

export class OverseerrConnectionError extends Error {
  constructor(
    message: string,
    public url: string,
    public cause?: Error,
  ) {
    super(`Overseerr connection error: ${message} (${url})`);
    this.name = "OverseerrConnectionError";
  }
}

