import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { request, setToken, documentUrl } from "./api";
import "./styles.css";

type Row = Record<string, any>;
const sections: [string, [string, string][]][] = [
  ["", [["Overview", "summary"]]],
  [
    "Accounts",
    [
      ["People", "users"],
      ["Publisher verification", "applications"],
    ],
  ],
  [
    "Catalog",
    [
      ["Audiobooks", "audiobooks"],
      ["Channels", "channels"],
      ["Content reports", "reports"],
    ],
  ],
  [
    "Revenue",
    [
      ["Subscription plans", "plans"],
      ["Payments", "payments"],
      ["Withdrawals", "withdrawals"],
      ["Refunds & adjustments", "adjustments"],
      ["Financial reporting", "finance"],
    ],
  ],
  [
    "System",
    [
      ["Generation policy", "settings"],
      ["Audit history", "audit"],
    ],
  ],
];
const navigation = sections.flatMap(([, items]) => items);
/** Sidebar sections that carry a pending-work badge, keyed by page. */
const attentionLabels: Record<string, string> = {
  applications: "Publisher applications awaiting review",
  reports: "Open content reports",
  withdrawals: "Withdrawal requests awaiting approval",
};
/** What each confirm-only decision does; a rejection asks for a reason instead. */
const consequences: Record<string, string> = {
  approve: "The request is approved and the member is notified.",
  suspend:
    "The member is signed out and cannot use the platform until the account is restored.",
  unsuspend: "The member regains access immediately.",
  restrict: "The content is hidden from listeners and the owner is notified.",
  restore: "The content becomes available to listeners again.",
  resolve: "The report is marked as resolved.",
  dismiss: "The report is closed without action.",
  complete: "The payout is recorded as completed (simulated, no transfer).",
};
const headings: Record<string, string> = {
  serial: "Member ID",
  member: "Member ID",
};
const label = (text: string) =>
  headings[text] ??
  text.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const memberId = (value: unknown) =>
  typeof value === "number" ? `U-${String(value).padStart(4, "0")}` : "—";
const dateTime = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const ICONS: Record<string, string> = {
  play: "M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z",
  refresh:
    "M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  bell: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1z",
  logout:
    "M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z",
  document:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h8v2H8zm0 4h8v2H8z",
};
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
const money = (value: unknown) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(
    Number(value),
  );
export function App() {
  const [user, setUser] = useState<Row | null>(null);
  const [page, setPage] = useState("summary");
  const [rows, setRows] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [number, setNumber] = useState(1);
  const [decision, setDecision] = useState<{
    path: string;
    action: string;
    name: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [audio, setAudio] = useState<Row[]>([]);
  const [document, setDocument] = useState("");
  const [plan, setPlan] = useState<Row | null>(null);
  const [attention, setAttention] = useState<Record<string, number>>({});
  const [alertsOpen, setAlertsOpen] = useState(false);
  const requestSequence = useRef(0);

  async function loadAttention() {
    try {
      const counts = await request("/admin/attention");
      if (counts && !Array.isArray(counts)) setAttention(counts);
    } catch {
      // Badges are a convenience; the pages themselves report errors.
    }
  }
  useEffect(() => {
    if (!user) return;
    loadAttention();
    const timer = setInterval(loadAttention, 30_000);
    return () => clearInterval(timer);
  }, [user]);
  const pendingTotal = Object.values(attention).reduce((a, b) => a + b, 0);
  function open(key: string) {
    setPage(key);
    setRows(null);
    setSearch("");
    setRole("");
    setNumber(1);
    setNotice("");
    setAlertsOpen(false);
  }

  async function load() {
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        `/admin/${page}?page=${number}&q=${encodeURIComponent(search)}${role ? `&account_type=${role}` : ""}`,
      );
      if (sequence === requestSequence.current) setRows(result);
    } catch (e) {
      if (sequence === requestSequence.current) {
        setError((e as Error).message);
        setRows(null);
      }
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (user) {
      const timer = setTimeout(load, 250);
      return () => {
        clearTimeout(timer);
        requestSequence.current++;
      };
    }
  }, [user, page, number, search, role]);
  useEffect(
    () => () => {
      if (document) URL.revokeObjectURL(document);
    },
    [document],
  );
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, method, body);
      setNotice("Changes saved.");
      await load();
      loadAttention();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function decide(path: string, action: string, name: string) {
    setReason("");
    setDecision({ path, action, name });
  }
  async function listen(id: string) {
    try {
      const data = await request(`/audiobooks/${id}/play`, "POST");
      setAudio(data.chapters);
      if (!data.chapters.length)
        setNotice("No audio chunks are available yet.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!user) return <Login onLogin={setUser} />;
  const title = navigation.find((n) => n[1] === page)?.[0] || "";
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("summary");
          }}
        >
          <img className="brand-mark" src="/logo.svg" alt="" />
          <span>
            BornoVerse<small>ADMINISTRATION</small>
          </span>
        </a>
        <nav aria-label="Administration">
          {sections.map(([heading, items]) => (
            <div className="nav-group" key={heading || "home"}>
              {heading && <span className="nav-heading">{heading}</span>}
              {items.map(([name, key]) => (
                <button
                  key={key}
                  className={page === key ? "selected" : ""}
                  aria-current={page === key ? "page" : undefined}
                  onClick={() => open(key)}
                >
                  <span>{name}</span>
                  {attention[key] > 0 && (
                    <span
                      className="nav-badge"
                      aria-label={`${attention[key]} pending`}
                    >
                      {attention[key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {String(user.username || "A")
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <div className="account-text">
            <strong>{user.username}</strong>
            <small>Administrator</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await request("/auth/logout", "POST").catch(() => {});
              setToken("");
              setUser(null);
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">Administration</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <div className="alerts">
              <button
                className="icon-button bordered"
                aria-label={`Pending work: ${pendingTotal}`}
                aria-expanded={alertsOpen}
                onClick={() => setAlertsOpen((v) => !v)}
              >
                <Icon name="bell" size={18} />
                {pendingTotal > 0 && <span className="dot" />}
              </button>
              {alertsOpen && (
                <div className="alerts-menu" role="menu">
                  <strong>Needs attention</strong>
                  {pendingTotal === 0 ? (
                    <p>Nothing is waiting for review.</p>
                  ) : (
                    Object.entries(attention)
                      .filter(([, n]) => n > 0)
                      .map(([key, n]) => (
                        <button
                          key={key}
                          role="menuitem"
                          className="alerts-item"
                          onClick={() => open(key)}
                        >
                          <span>{attentionLabels[key] ?? label(key)}</span>
                          <span className="nav-badge">{n}</span>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
            <button className="secondary" disabled={busy} onClick={load}>
              <Icon name="refresh" />
              Refresh
            </button>
          </div>
        </header>
        {page === "summary" && (
          <p className="lead">
            Platform health and the work waiting for review.
          </p>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {["users", "audiobooks"].includes(page) && (
          <div className="toolbar">
            <input
              aria-label="Search"
              placeholder={
                page === "users"
                  ? "Search email or username…"
                  : "Search audiobook title…"
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setNumber(1);
              }}
            />
            {page === "users" && (
              <select
                aria-label="Account type"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setNumber(1);
                }}
              >
                <option value="">All accounts</option>
                <option value="user">Users</option>
                <option value="publisher">Verified publishers</option>
                <option value="admin">Administrators</option>
              </select>
            )}
          </div>
        )}
        {busy && <p role="status">Loading…</p>}
        {!busy && rows && page === "summary" && (
          <>
            <div className="metrics">
              {Object.entries(rows).map(([key, value]) => (
                <article key={key}>
                  <span>{label(key)}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
            <section className="panel">
              <h2>Needs attention</h2>
              {pendingTotal === 0 ? (
                <p>Nothing is waiting for review.</p>
              ) : (
                <ul className="queue">
                  {Object.entries(attention)
                    .filter(([, n]) => n > 0)
                    .map(([key, n]) => (
                      <li key={key}>
                        <span>{attentionLabels[key] ?? label(key)}</span>
                        <span className="nav-badge">{n}</span>
                        <button className="secondary" onClick={() => open(key)}>
                          Review
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </>
        )}
        {!busy && rows && page === "settings" && (
          <form
            className="panel form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate("/admin/settings", "PUT", rows);
            }}
          >
            <div className="full">
              <h2>Generation & revenue policy</h2>
              <p>
                Quotas reset on calendar months in Asia/Dhaka. Retries within a
                request do not consume another slot.
              </p>
            </div>
            {Object.entries(rows).map(([key, value]) => (
              <label key={key}>
                {label(key)}
                {key === "revenue_base" ? (
                  <select value={String(value)} disabled>
                    <option value="gross_confirmed_subscription_receipts">
                      Confirmed subscription receipts (gross)
                    </option>
                  </select>
                ) : (
                  <input
                    required
                    type="number"
                    step={key === "publisher_fee" ? ".01" : "1"}
                    min="0"
                    value={String(value)}
                    onChange={(e) =>
                      setRows({
                        ...rows,
                        [key]:
                          key === "publisher_fee"
                            ? e.target.value
                            : Number(e.target.value),
                      })
                    }
                  />
                )}
              </label>
            ))}
            <div className="full">
              <p>
                Registration fees are excluded from the publisher pool. Taxes,
                gateway fees and refunds require an explicit accounting policy
                before production.
              </p>
              <button disabled={busy}>Save policy</button>
            </div>
          </form>
        )}
        {!busy && rows && page === "finance" && (
          <>
            <div className="metrics">
              {Object.entries(rows)
                .filter(([k]) => k !== "snapshots")
                .map(([k, v]) => (
                  <article key={k}>
                    <span>{label(k)}</span>
                    <strong>{money(v)}</strong>
                  </article>
                ))}
            </div>
            <form
              className="panel toolbar"
              onSubmit={async (e) => {
                e.preventDefault();
                const month = new FormData(e.currentTarget).get("month");
                await mutate(`/admin/finance/close/${month}`, "POST");
              }}
            >
              <label>
                Close completed month
                <input name="month" type="month" required />
              </label>
              <button>Calculate & close month</button>
              <p>
                Snapshots are immutable. No eligible views leaves the pool as an
                unallocated liability.
              </p>
            </form>
            <DataTable
              rows={rows.snapshots}
              columns={[
                "month",
                "revenue",
                "publisher_pool",
                "platform_share",
                "created_at",
              ]}
            />
          </>
        )}
        {!busy && page === "adjustments" && (
          <AdjustmentForm
            submit={async (body) => mutate("/admin/adjustments", "POST", body)}
          />
        )}
        {!busy && Array.isArray(rows) && (
          <>
            {page === "plans" && (
              <button
                onClick={() =>
                  setPlan({
                    name: "",
                    months: 1,
                    price: "150.00",
                    active: true,
                  })
                }
              >
                Add subscription plan
              </button>
            )}
            <DataTable
              rows={rows}
              columns={columns[page] || []}
              actions={(row) => (
                <div className="actions">
                  {page === "users" && row.account_type !== "admin" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        decide(
                          `/admin/users/${row.id}/decision`,
                          row.suspended ? "unsuspend" : "suspend",
                          row.email,
                        )
                      }
                    >
                      {row.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  )}
                  {page === "applications" && (
                    <>
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            setDocument(await documentUrl(row.id));
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <Icon name="document" size={14} />
                        View document
                      </button>
                      {row.status === "pending" && (
                        <>
                          <button
                            onClick={() =>
                              decide(
                                `/admin/applications/${row.id}/decision`,
                                "approve",
                                row.legal_name,
                              )
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              decide(
                                `/admin/applications/${row.id}/decision`,
                                "reject",
                                row.legal_name,
                              )
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {["audiobooks", "channels"].includes(page) && (
                    <>
                      <button
                        className="secondary"
                        onClick={() =>
                          decide(
                            `/admin/moderation/${page}/${row.id}`,
                            row.moderated ? "restore" : "restrict",
                            row.title || row.name,
                          )
                        }
                      >
                        {row.moderated ? "Restore" : "Restrict"}
                      </button>
                      {page === "audiobooks" && (
                        <button
                          className="secondary"
                          onClick={() => listen(row.id)}
                        >
                          <Icon name="play" size={14} />
                          Listen
                        </button>
                      )}
                    </>
                  )}
                  {page === "reports" && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => listen(row.audiobook_id)}
                      >
                        <Icon name="play" size={14} />
                        Listen
                      </button>
                      {row.status === "open" && (
                        <>
                          <button
                            onClick={() =>
                              decide(
                                `/admin/reports/${row.id}/decision`,
                                "resolve",
                                row.reason,
                              )
                            }
                          >
                            Resolve
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              decide(
                                `/admin/reports/${row.id}/decision`,
                                "dismiss",
                                row.reason,
                              )
                            }
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {page === "plans" && (
                    <button
                      className="secondary"
                      onClick={() => setPlan({ ...row })}
                    >
                      Edit
                    </button>
                  )}
                  {page === "withdrawals" &&
                    ["pending", "approved"].includes(row.status) && (
                      <>
                        <button
                          onClick={() =>
                            decide(
                              `/admin/withdrawals/${row.id}/decision`,
                              row.status === "pending" ? "approve" : "complete",
                              `${money(row.amount)} · simulated payout`,
                            )
                          }
                        >
                          {row.status === "pending"
                            ? "Approve"
                            : "Record simulated completion"}
                        </button>
                        {row.status === "pending" && (
                          <button
                            className="secondary"
                            onClick={() =>
                              decide(
                                `/admin/withdrawals/${row.id}/decision`,
                                "reject",
                                "Withdrawal",
                              )
                            }
                          >
                            Reject
                          </button>
                        )}
                      </>
                    )}
                </div>
              )}
            />
            {!["plans"].includes(page) && (
              <div className="pagination">
                <button
                  className="secondary"
                  disabled={number === 1}
                  onClick={() => setNumber(number - 1)}
                >
                  Previous
                </button>
                <span>Page {number}</span>
                <button
                  className="secondary"
                  disabled={rows.length < 50}
                  onClick={() => setNumber(number + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
        <footer>
          BornoVerse · Administration <span>All financial values in BDT</span>
        </footer>
      </main>
      {decision && (
        <Modal
          title={`${label(decision.action)} · ${decision.name}`}
          close={() => setDecision(null)}
        >
          <form
            className="decision"
            onSubmit={async (e) => {
              e.preventDefault();
              const rejecting = decision.action === "reject";
              if (
                await mutate(decision.path, "POST", {
                  action: decision.action,
                  ...(rejecting ? { reason: reason.trim() } : {}),
                })
              )
                setDecision(null);
            }}
          >
            {decision.action === "reject" ? (
              <>
                <label>
                  Reason for rejection
                  <textarea
                    autoFocus
                    required
                    minLength={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p>
                  The member receives this reason in their notifications. The
                  decision is recorded in the audit history.
                </p>
              </>
            ) : (
              <p>
                {consequences[decision.action] ?? "Confirm this decision."} The
                decision is recorded in the audit history.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDecision(null)}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className={decision.action === "reject" ? "danger" : ""}
              >
                Confirm {decision.action}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {plan && (
        <Modal title="Subscription plan" close={() => setPlan(null)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const { name, months, price, active } = plan;
              if (
                await mutate(
                  `/admin/plans${plan.id ? `/${plan.id}` : ""}`,
                  plan.id ? "PUT" : "POST",
                  { name, months, price, active },
                )
              )
                setPlan(null);
            }}
          >
            {["name", "months", "price"].map((key) => (
              <label key={key}>
                {label(key)}
                <input
                  required
                  type={key === "name" ? "text" : "number"}
                  step={key === "price" ? ".01" : "1"}
                  min="1"
                  value={plan[key]}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      [key]:
                        key === "months"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label>
              Available
              <select
                value={String(plan.active)}
                onChange={(e) =>
                  setPlan({ ...plan, active: e.target.value === "true" })
                }
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <button disabled={busy}>Save plan</button>
          </form>
        </Modal>
      )}
      {audio.length > 0 && (
        <Modal title="Listen" close={() => setAudio([])}>
          <ol className="tracks">
            {audio.map((c, i) => (
              <li key={c.id}>
                <span className="track-number">{i + 1}</span>
                <div className="track-body">
                  <strong>{c.title}</strong>
                  <audio controls preload="none" src={c.audio_url} />
                </div>
              </li>
            ))}
          </ol>
        </Modal>
      )}
      {document && (
        <Modal
          title="Publisher verification document"
          close={() => setDocument("")}
        >
          <a href={document} target="_blank" rel="noreferrer">
            Open PDF in a new tab
          </a>
          <iframe title="Verification PDF" src={document} />
        </Modal>
      )}
    </div>
  );
}
const columns: Record<string, string[]> = {
  users: [
    "serial",
    "username",
    "email",
    "account_type",
    "publisher_status",
    "suspended",
    "created_at",
  ],
  applications: ["legal_name", "member", "status", "reason", "created_at"],
  audiobooks: [
    "title",
    "author",
    "access_tier",
    "publication_status",
    "moderated",
  ],
  channels: ["name", "owner_id", "moderated"],
  reports: ["reason", "audiobook_id", "status", "resolution"],
  plans: ["name", "months", "price", "active"],
  payments: ["id", "kind", "amount", "status", "created_at"],
  withdrawals: ["member", "amount", "destination", "status", "reason"],
  adjustments: ["created_at", "order_id", "kind", "amount", "reason"],
  audit: ["created_at", "action", "actor_id", "target", "details"],
};
function DataTable({
  rows,
  columns,
  actions,
}: {
  rows: Row[];
  columns: string[];
  actions?: (row: Row) => React.ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{label(c)}</th>
            ))}
            {actions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1}>
                <div className="empty">No records found.</div>
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.id || row.month || i}>
                {columns.map((c) => (
                  <td key={c}>
                    {c === "serial" || c === "member" ? (
                      <span className="mono">{memberId(row[c])}</span>
                    ) : c.endsWith("_at") ? (
                      dateTime(row[c])
                    ) : c === "status" ||
                      c === "publisher_status" ||
                      c === "account_type" ? (
                      <span className={`badge ${row[c]}`}>
                        {label(String(row[c]))}
                      </span>
                    ) : typeof row[c] === "object" ? (
                      JSON.stringify(row[c])
                    ) : typeof row[c] === "boolean" ? (
                      row[c] ? (
                        "Yes"
                      ) : (
                        "No"
                      )
                    ) : (
                      String(row[c] ?? "—")
                    )}
                  </td>
                ))}
                {actions && <td>{actions(row)}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLElement>("input, textarea, button, select, a")
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="scrim" onClick={close}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") {
            const focusable = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input, textarea, select, a[href], audio",
              ) || [],
            );
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (e.shiftKey && window.document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            }
            if (!e.shiftKey && window.document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: Row) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-story">
        <span className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" />
          BornoVerse
        </span>
        <h1>
          Good stories.
          <br />
          Thoughtful stewardship.
        </h1>
        <p>The workspace for the people behind the listening experience.</p>
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const data = await request("/auth/admin-login", "POST", {
              username_or_email: form.get("email"),
              password: form.get("password"),
            });
            setToken(data.access_token);
            onLogin(data.user);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="eyebrow">Administrator access</p>
        <h2>Welcome back</h2>
        <p>Sign in with your dedicated administrator account.</p>
        <label>
          Email or username
          <input name="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <small>
          Administrator accounts are provisioned by the platform operator.
        </small>
      </form>
    </div>
  );
}
function AdjustmentForm({
  submit,
}: {
  submit: (body: unknown) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        setBusy(true);
        try {
          if (await submit({ ...data, reference: crypto.randomUUID() }))
            form.reset();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="full">
        <h2>Record a simulated deduction</h2>
        <p>
          Only confirmed orders in an unclosed month are eligible. Deductions
          reduce that month's distributable subscription receipts. Entitlements
          remain until paid expiry; no external transfer occurs.
        </p>
      </div>
      <label>
        Order ID
        <input name="order_id" required />
      </label>
      <label>
        Amount (BDT)
        <input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        Type
        <select name="kind">
          <option value="refund">Refund</option>
          <option value="adjustment">Receipt correction</option>
        </select>
      </label>
      <label>
        Reason
        <textarea name="reason" required minLength={10} />
      </label>
      <button disabled={busy}>Record deduction</button>
    </form>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
