export type ServiceResponse<D> =
  | {
      ok: true;
      error: null;
      data: D;
    }
  | {
      ok: false;
      error: string;
      data: null;
    };
