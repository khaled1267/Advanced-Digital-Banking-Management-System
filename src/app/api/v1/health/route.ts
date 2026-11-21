import { connectToDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

type MongoErrorDetails = Error & {
  code?: unknown;
  codeName?: unknown;
  reason?: { servers?: Map<unknown, { error?: unknown }> };
};

function getSafeDiagnostic(error: unknown) {
  const root = error instanceof Error ? (error as MongoErrorDetails) : null;
  const serverErrors = root?.reason?.servers
    ? Array.from(root.reason.servers.values()).map((server) =>
        server.error instanceof Error
          ? (server.error as MongoErrorDetails)
          : null,
      )
    : [];
  const details = [root, ...serverErrors].filter(
    (item): item is MongoErrorDetails => item !== null,
  );
  const errorText = details.map((item) => item.message).join(" ");

  let category = "connection_failed";
  let message = "MongoDB connection failed.";

  if (root?.name === "ZodError") {
    category = "configuration_error";
    message = "MongoDB environment configuration is invalid.";
  } else if (/authentication failed|bad auth|auth failed/i.test(errorText)) {
    category = "authentication_failed";
    message = "MongoDB Atlas rejected database authentication.";
  } else if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(errorText)) {
    category = "dns_or_srv_lookup_failed";
    message = "MongoDB Atlas SRV DNS lookup failed.";
  } else if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH/i.test(errorText)) {
    category = "network_unreachable";
    message = "MongoDB host could not be reached.";
  } else if (/ETIMEDOUT|ETIMEOUT|timed out/i.test(errorText)) {
    category = "connection_timeout";
    message = "MongoDB server selection timed out.";
  } else if (/TLS|SSL|certificate/i.test(errorText)) {
    category = "tls_error";
    message = "MongoDB TLS connection failed.";
  } else if (/invalid.*(uri|connection string)|URI malformed/i.test(errorText)) {
    category = "invalid_connection_string";
    message = "MongoDB connection string is invalid.";
  }

  const code = details.find((item) => typeof item.code === "string" || typeof item.code === "number")?.code;
  const codeName = details.find((item) => typeof item.codeName === "string")?.codeName;

  return {
    name: root?.name ?? "UnknownError",
    ...(code !== undefined && { code }),
    ...(typeof codeName === "string" && { codeName }),
    category,
    message,
  };
}

export async function GET() {
  try {
    const mongoose = await connectToDatabase();

    if (mongoose.connection.readyState !== 1) {
      return Response.json(
        {
          status: "error",
          database: "disconnected",
          message: "Database connection is unavailable.",
        },
        { status: 503 },
      );
    }

    return Response.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error(
      `[health] MongoDB connection failed ${JSON.stringify(getSafeDiagnostic(error))}`,
    );

    const configured = Boolean(
      process.env.MONGODB_URI && process.env.MONGODB_DATABASE,
    );

    return Response.json(
      {
        status: "error",
        database: configured ? "unavailable" : "not_configured",
        message: configured
          ? "Database connection is unavailable."
          : "Database connection is not configured.",
      },
      { status: 503 },
    );
  }
}
