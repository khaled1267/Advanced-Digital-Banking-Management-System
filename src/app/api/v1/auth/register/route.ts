import { connectToDatabase } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { userRegistrationSchema } from "@/lib/validation/user";
import { User } from "@/models/User";

export const runtime = "nodejs";

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "error", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const result = userRegistrationSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        status: "error",
        message: "Invalid registration data.",
        errors: result.error.issues.map(({ path, message }) => ({
          field: path.join("."),
          message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();

    const existingUser = await User.exists({ email: result.data.email });

    if (existingUser) {
      return Response.json(
        { status: "error", message: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(result.data.password);
    const user = await User.create({
      name: result.data.name,
      email: result.data.email,
      passwordHash,
      role: "CUSTOMER",
    });

    return Response.json(
      {
        status: "success",
        message: "Registration successful.",
        data: {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt,
          },
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return Response.json(
        { status: "error", message: "An account with this email already exists." },
        { status: 409 },
      );
    }

    return Response.json(
      { status: "error", message: "Registration could not be completed." },
      { status: 500 },
    );
  }
}
