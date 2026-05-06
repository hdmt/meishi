import type { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  const user = Netlify.env.get("BASIC_AUTH_USER");
  const password = Netlify.env.get("BASIC_AUTH_PASSWORD");

  if (!user || !password) {
    return new Response("Basic auth not configured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="meishi"' },
    });
  }

  let providedUser = "";
  let providedPassword = "";
  try {
    const decoded = atob(authHeader.slice(6));
    const idx = decoded.indexOf(":");
    providedUser = idx === -1 ? decoded : decoded.slice(0, idx);
    providedPassword = idx === -1 ? "" : decoded.slice(idx + 1);
  } catch {
    return new Response("Invalid auth header", { status: 400 });
  }

  if (providedUser !== user || providedPassword !== password) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="meishi"' },
    });
  }

  return context.next();
};

export const config = {
  path: "/*",
};
