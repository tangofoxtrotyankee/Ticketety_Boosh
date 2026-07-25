import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const [entries, actors] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 200 }),
    prisma.user.findMany({ select: { id: true, email: true } }),
  ]);
  const actorEmail = new Map(actors.map((u) => [u.id, u.email]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        Last 200 recorded actions, newest first.
      </p>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(entry.at)}
                </TableCell>
                <TableCell>
                  {entry.actorId
                    ? (actorEmail.get(entry.actorId) ?? entry.actorId)
                    : "system"}
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                <TableCell className="font-mono text-xs">
                  {entry.entity}:{entry.entityId.slice(0, 10)}…
                </TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs">
                  {entry.meta ? JSON.stringify(entry.meta) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
