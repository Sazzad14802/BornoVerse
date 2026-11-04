// Publisher withdrawals: payout details, approval with a payment date, and the
// record of the manual payment (method, reference, date). Money is sent by hand
// outside the system; this page keeps track of when and how it was sent.
import React, { useEffect, useState } from "react";
import { request } from "./api";
import { Modal, Row, dateTime, memberId } from "./ui";

const STATUS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved · to be paid",
  completed: "Paid",
  rejected: "Rejected",
};

const METHODS: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank: "Bank transfer",
  other: "Other",
};

const money = (value: unknown) => `৳${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export function WithdrawalsPage({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  async function load() {
    setError("");
    try {
      const all: Row[] = await request("/admin/withdrawals");
      setRows(status ? all.filter((r) => r.status === status) : all);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [status]);

  return (
    <>
      <div className="toolbar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending review</option>
            <option value="approved">Approved, not paid yet</option>
            <option value="completed">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="">All requests</option>
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Requested</th>
              <th>Publisher</th>
              <th>Amount</th>
              <th>Send to</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Loading…</div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No withdrawal requests here.</div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.created_at)}</td>
                  <td className="mono">{memberId(r.member)}</td>
                  <td>
                    <strong>{money(r.amount)}</strong>
                  </td>
                  <td>
                    {METHODS[r.method] ?? r.method}
                    <div className="subtle">{r.account_number || r.destination}</div>
                  </td>
                  <td>
                    <span className={`badge ${r.status}`}>{STATUS[r.status] ?? r.status}</span>
                  </td>
                  <td>
                    {r.status === "completed" ? (
                      <>
                        {dateTime(r.paid_at)}
                        <div className="subtle">Ref: {r.payout_reference}</div>
                      </>
                    ) : r.status === "approved" && r.scheduled_for ? (
                      <>By {dateTime(r.scheduled_for)}</>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button onClick={() => setOpen(r)}>Open</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <WithdrawalCase
          row={open}
          close={() => setOpen(null)}
          onChanged={() => {
            load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function WithdrawalCase({ row, close, onChanged }: { row: Row; close: () => void; onChanged: () => void }) {
  const [pane, setPane] = useState<"approve" | "complete" | "reject" | null>(null);
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/withdrawals/${row.id}/decision`, "POST", body);
      onChanged();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const iso = (day: string) => new Date(`${day}T12:00:00`).toISOString();

  return (
    <Modal title={`Withdrawal · ${money(row.amount)}`} close={close} wide>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <dl className="facts">
        <dt>Publisher</dt>
        <dd className="mono">{memberId(row.member)}</dd>
        <dt>Amount</dt>
        <dd>
          <strong>{money(row.amount)}</strong>
        </dd>
        <dt>Requested</dt>
        <dd>{dateTime(row.created_at)}</dd>
        <dt>Status</dt>
        <dd>
          <span className={`badge ${row.status}`}>{STATUS[row.status] ?? row.status}</span>
        </dd>
        <dt>Method</dt>
        <dd>{METHODS[row.method] ?? row.method}</dd>
        {row.method === "bank" ? (
          <>
            <dt>Bank</dt>
            <dd>{row.bank_name || "—"}</dd>
            <dt>Branch</dt>
            <dd>{row.branch || "—"}</dd>
          </>
        ) : null}
        <dt>Account name</dt>
        <dd>{row.account_name || "—"}</dd>
        <dt>{row.method === "bank" ? "Account number" : "Mobile number"}</dt>
        <dd className="mono">{row.account_number || row.destination}</dd>
        {row.scheduled_for && (
          <>
            <dt>Pay by</dt>
            <dd>{dateTime(row.scheduled_for)}</dd>
          </>
        )}
        {row.status === "completed" && (
          <>
            <dt>Paid on</dt>
            <dd>{dateTime(row.paid_at)}</dd>
            <dt>Reference</dt>
            <dd className="mono">{row.payout_reference}</dd>
            {row.payout_note && (
              <>
                <dt>Note</dt>
                <dd>{row.payout_note}</dd>
              </>
            )}
          </>
        )}
        {row.status === "rejected" && (
          <>
            <dt>Reason</dt>
            <dd>{row.reason}</dd>
          </>
        )}
      </dl>
      <p className="subtle">
        Send the money yourself from the platform's wallet or bank, then record the transaction here. The publisher is
        notified at each step.
      </p>

      {!pane && (
        <div className="modal-actions">
          {row.status === "pending" && (
            <>
              <button className="secondary" onClick={() => setPane("reject")}>
                Reject
              </button>
              <button onClick={() => setPane("approve")}>Approve</button>
            </>
          )}
          {row.status === "approved" && <button onClick={() => setPane("complete")}>Mark as paid</button>}
        </div>
      )}

      {pane === "approve" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send({ action: "approve", scheduled_for: iso(date), reason: note });
          }}
        >
          <h4>Approve and set the payment date</h4>
          <label>
            Money will be sent by
            <input type="date" required min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Note to the publisher (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setPane(null)}>
              Cancel
            </button>
            <button disabled={busy}>Approve</button>
          </div>
        </form>
      )}

      {pane === "complete" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send({ action: "complete", payout_reference: reference, paid_at: iso(date), payout_note: note });
          }}
        >
          <h4>Record the payment</h4>
          <label>
            Transaction ID / reference
            <input required minLength={3} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={150} />
          </label>
          <label>
            Sent on
            <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            How it was sent (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. bKash merchant wallet, Sonali Bank transfer"
              maxLength={500}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setPane(null)}>
              Cancel
            </button>
            <button disabled={busy || reference.trim().length < 3}>Mark as paid</button>
          </div>
        </form>
      )}

      {pane === "reject" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send({ action: "reject", reason });
          }}
        >
          <h4>Reject the request</h4>
          <label>
            Reason (sent to the publisher)
            <textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setPane(null)}>
              Cancel
            </button>
            <button disabled={busy || reason.trim().length < 3}>Reject</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
