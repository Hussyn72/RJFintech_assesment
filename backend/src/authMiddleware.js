import jwt from "jsonwebtoken";

function getTokenFromHeader(header) {
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export function requireAuth(req, _res, next) {
  try {
    const token = getTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw Object.assign(new Error("Missing bearer token"), { statusCode: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw Object.assign(new Error("JWT_SECRET is not configured"), { statusCode: 500 });
    }

    const payload = jwt.verify(token, secret);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw Object.assign(new Error("Invalid token subject"), { statusCode: 401 });
    }

    req.authUser = {
      userId,
      email: payload.email,
      departmentId: payload.departmentId,
      isAdmin: payload.isAdmin
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(Object.assign(new Error("Invalid or expired token"), { statusCode: 401 }));
    }
    return next(error);
  }
}
