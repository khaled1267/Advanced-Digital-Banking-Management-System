import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getReviewTarget } from "@/lib/transaction-review-operations";
import { suspiciousFlagQuerySchema } from "@/lib/validation/transaction-review";
import { SuspiciousTransactionFlag } from "@/models/SuspiciousTransactionFlag";
import { Transaction } from "@/models/Transaction";
import { Deposit } from "@/models/Deposit";
import { Withdrawal } from "@/models/Withdrawal";
import { TransactionReview } from "@/models/TransactionReview";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userSummary(user: unknown) {
  if (typeof user !== "object" || user === null || !("name" in user)) return null;
  const value = user as unknown as { _id: unknown; name: string; role: string; email: string };
  return { id: String(value._id), name: value.name, role: value.role, email: value.email };
}

export async function GET(request: NextRequest) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;
  const parsed = suspiciousFlagQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid suspicious transaction query." }, { status: 400 });

  try {
    await connectToDatabase();
    const { search, targetType, status, reason, startDate, endDate, page, limit } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
      filter.active = status === "OPEN" || status === "UNDER_REVIEW";
    } else {
      filter.active = true;
    }
    if (targetType) filter.targetType = targetType;
    if (reason) filter.reason = reason;
    if (startDate || endDate) {
      const flaggedAt: { $gte?: Date; $lt?: Date } = {};
      if (startDate) flaggedAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) {
        flaggedAt.$lt = new Date(`${endDate}T00:00:00.000Z`);
        flaggedAt.$lt.setUTCDate(flaggedAt.$lt.getUTCDate() + 1);
      }
      filter.flaggedAt = flaggedAt;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const [transactionIds, depositIds, withdrawalIds] = await Promise.all([
        Transaction.find({ transactionId: pattern }).distinct("_id"),
        Deposit.find({ depositId: pattern }).distinct("_id"),
        Withdrawal.find({ withdrawalId: pattern }).distinct("_id"),
      ]);
      const matches = [
        ...(targetType && targetType !== "TRANSACTION" ? [] : [{ targetType: "TRANSACTION", targetId: { $in: transactionIds } }]),
        ...(targetType && targetType !== "DEPOSIT_REQUEST" ? [] : [{ targetType: "DEPOSIT_REQUEST", targetId: { $in: depositIds } }]),
        ...(targetType && targetType !== "WITHDRAWAL_REQUEST" ? [] : [{ targetType: "WITHDRAWAL_REQUEST", targetId: { $in: withdrawalIds } }]),
      ];
      filter.$or = matches;
    }

    const [flags, total] = await Promise.all([
      SuspiciousTransactionFlag.find(filter)
        .populate({ path: "flaggedBy", select: "name email role" })
        .populate({ path: "reviewedBy", select: "name email role" })
        .populate({ path: "history.actorId", select: "name email role" })
        .sort({ flaggedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SuspiciousTransactionFlag.countDocuments(filter),
    ]);
    const items = await Promise.all(flags.map(async (flag) => ({
      id: flag._id.toString(),
      targetType: flag.targetType,
      targetId: flag.targetId.toString(),
      target: await getReviewTarget(flag.targetType, flag.targetId.toString()),
      staffReview: await TransactionReview.findOne({ targetType: flag.targetType, targetId: flag.targetId })
        .populate({ path: "history.actorId", select: "name email role" }).lean()
        .then((review) => review ? {
          status: review.reviewStatus,
          note: review.reviewNote ?? null,
          history: review.history.map((entry) => ({
            action: entry.action,
            previousStatus: entry.previousStatus ?? null,
            newStatus: entry.newStatus ?? null,
            note: entry.note ?? null,
            createdAt: entry.createdAt,
            actor: userSummary(entry.actorId),
          })),
        } : null),
      reason: flag.reason,
      explanation: flag.explanation ?? null,
      status: flag.status,
      active: flag.active,
      flaggedAt: flag.flaggedAt,
      flaggedBy: userSummary(flag.flaggedBy),
      reviewedAt: flag.reviewedAt ?? null,
      reviewedBy: userSummary(flag.reviewedBy),
      adminReviewNote: flag.adminReviewNote ?? null,
      history: flag.history.map((entry) => ({
        action: entry.action,
        previousStatus: entry.previousStatus ?? null,
        newStatus: entry.newStatus,
        note: entry.note ?? null,
        createdAt: entry.createdAt,
        actor: userSummary(entry.actorId),
      })),
    })));
    return NextResponse.json({ status: "success", data: { flags: items, total, page, limit, totalPages: Math.ceil(total / limit) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve flagged transactions." }, { status: 500 });
  }
}
