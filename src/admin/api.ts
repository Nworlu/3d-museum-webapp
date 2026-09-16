export interface ExhibitSummary {
  id: string;
  kind: string;
  title: string;
  description: string;
  imageUrl?: string;
}

export interface RoomSummary {
  roomId: string;
  boundary: { minX: number; maxX: number; minZ: number; maxZ: number };
  exhibits: ExhibitSummary[];
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new AdminApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export function basicAuthHeader(password: string): string {
  return `Basic ${btoa(`admin:${password}`)}`;
}

export function getRooms(authHeader: string): Promise<{ rooms: RoomSummary[] }> {
  return fetch("/api/admin/rooms", { headers: { Authorization: authHeader } }).then((res) =>
    unwrap<{ rooms: RoomSummary[] }>(res),
  );
}

export function addExhibit(
  authHeader: string,
  fields: {
    roomId: string;
    wall: "west" | "east";
    offsetFraction: number;
    height: number;
    title: string;
    description: string;
    image: File;
  },
): Promise<{ exhibit: ExhibitSummary }> {
  const form = new FormData();
  form.set("roomId", fields.roomId);
  form.set("wall", fields.wall);
  form.set("offsetFraction", String(fields.offsetFraction));
  form.set("height", String(fields.height));
  form.set("title", fields.title);
  form.set("description", fields.description);
  form.set("image", fields.image);
  return fetch("/api/admin/exhibits", {
    method: "POST",
    headers: { Authorization: authHeader },
    body: form,
  }).then((res) => unwrap<{ exhibit: ExhibitSummary }>(res));
}

export function deleteExhibit(authHeader: string, roomId: string, exhibitId: string): Promise<{ ok: true }> {
  return fetch(`/api/admin/exhibits/${encodeURIComponent(roomId)}/${encodeURIComponent(exhibitId)}`, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  }).then((res) => unwrap<{ ok: true }>(res));
}
