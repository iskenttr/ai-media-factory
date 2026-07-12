import { hashToken, SESSION_COOKIE } from "./security";

export function ownerHashFromRequest(request: Request) {
  const encoded = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return encoded ? hashToken(decodeURIComponent(encoded)) : null;
}
