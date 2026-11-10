import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { documentUrl, getToken, query, request, setToken, setUnauthorizedHandler } from "./api";
import "./styles.css";
import {
  FilterBar,
  FilterField,
  Filters,
  Icon,
  Modal,
  Row,
  auditId,
  channelId,
  dateTime,
  memberId,
  memberLabel,
  paymentId,
  useDebounced,
} from "./ui";
import { AppealsPage, ReportsPage, UserRecordModal } from "./Moderation";
import { WithdrawalsPage } from "./Withdrawals";

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
    ],
  ],
  [
    "Moderation",
    [
      ["Content reports", "reports"],
      ["Appeals", "appeals"],
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
const pageKeys = new Set(navigation.map(([, key]) => key));
/** Pages that load and filter their own data. */
const selfLoading = new Set(["reports", "appeals", "withdrawals"]);
/** Sidebar sections that carry a pending-work badge, keyed by page. */
const attentionLabels: Record<string, string> = {
  applications: "Publisher applications awaiting review",
  reports: "Open content reports",
  appeals: "Appeals awaiting a decision",
  withdrawals: "Withdrawal requests awaiting approval",
};
/** What each confirm-only decision does; a rejection asks for a reason instead. */
const consequences: Record<string, string> = {
  approve: "The request is approved and the member is notified.",
  suspend: "The member is signed out and cannot use the platform until the account is restored.",
  unsuspend: "The member regains access immediately.",
  restrict: "The content is hidden from listeners and the owner is notified.",
  restore: "The content becomes available to listeners again.",
  resolve: "The report is marked as resolved.",
  dismiss: "The report is closed without action.",
  complete: "The payout is recorded as completed (simulated, no transfer).",
};
/** Button colour by what an action does. */
const intent: Record<string, string> = {
  approve: "success",
  unsuspend: "success",
  restore: "success",
  resolve: "success",
  suspend: "warn",
  restrict: "warn",
  reject: "danger",
  dismiss: "secondary",
};
const label = (text: string) =>
  ({ serial: "ID", member: "Member ID" })[text] ??
  text.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const money = (value: unknown) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(Number(value));

const ANY: [string, string] = ["", "Any"];
const YES_NO: [string, string][] = [ANY, ["true", "Yes"], ["false", "No"]];
const SORT_DATE: [string, string][] = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
];

/** Filters per list page. */
function filterFields(page: string, auditGroups: string[]): FilterField[] {
  const dates: FilterField = { kind: "dates" };
  switch (page) {
    case "users":
      return [
        { key: "q", kind: "search", placeholder: "Search name, email or U-0001…" },
        {
          key: "account_type",
          kind: "select",
          label: "Account",
          options: [
            ["", "All accounts"],
            ["user", "Users"],
            ["publisher", "Verified publishers"],
            ["admin", "Administrators"],
          ],
        },
        {
          key: "publisher_status",
          kind: "select",
          label: "Publisher status",
          options: [
            ANY,
            ["none", "Not a publisher"],
            ["pending_approval", "Pending approval"],
            ["approved_pending_payment", "Approved, fee unpaid"],
            ["active", "Active publisher"],
            ["rejected", "Rejected"],
          ],
        },
        { key: "suspended", kind: "select", label: "Suspended", options: YES_NO },
        { key: "published", kind: "select", label: "Has published", options: YES_NO },
        { key: "premium", kind: "select", label: "Premium", options: YES_NO },
        dates,
        { key: "sort", kind: "select", label: "Sort", options: [...SORT_DATE, ["username", "Username A–Z"]] },
      ];
    case "applications":
      return [
        { key: "q", kind: "search", placeholder: "Search legal name, member or U-0001…" },
        {
          key: "status",
          kind: "select",
          label: "Status",
          options: [ANY, ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]],
        },
        dates,
        { key: "sort", kind: "select", label: "Sort", options: SORT_DATE },
      ];
    case "audiobooks":
      return [
        { key: "q", kind: "search", placeholder: "Search title or author…" },
        { key: "owner", kind: "search", placeholder: "Owner: name, email or U-0001…" },
        { key: "access_tier", kind: "select", label: "Access", options: [ANY, ["free", "Free"], ["premium", "Premium"]] },
        {
          key: "status",
          kind: "select",
          label: "Generation",
          options: [ANY, ["COMPLETED", "Completed"], ["PROCESSING", "Processing"], ["PENDING", "Pending"], ["FAILED", "Failed"]],
        },
        {
          key: "publication_status",
          kind: "select",
          label: "Publication",
          options: [ANY, ["published", "Published"], ["draft", "Draft"], ["deleted", "Deleted"]],
        },
        { key: "visibility", kind: "select", label: "Visibility", options: [ANY, ["PUBLIC", "Public"], ["PRIVATE", "Private"]] },
        { key: "moderated", kind: "select", label: "Restricted", options: YES_NO },
        { key: "in_channel", kind: "select", label: "In a channel", options: YES_NO },
        { key: "language", kind: "select", label: "Language", options: [ANY, ["bn", "Bangla"], ["en", "English"]] },
        dates,
        {
          key: "sort",
          kind: "select",
          label: "Sort",
          options: [...SORT_DATE, ["title", "Title A–Z"], ["longest", "Longest first"]],
        },
      ];
    case "channels":
      return [
        { key: "q", kind: "search", placeholder: "Search channel name or C-0001…" },
        { key: "owner", kind: "search", placeholder: "Owner: name, email or U-0001…" },
        { key: "moderated", kind: "select", label: "Restricted", options: YES_NO },
        dates,
        { key: "sort", kind: "select", label: "Sort", options: [...SORT_DATE, ["name", "Name A–Z"]] },
      ];
    case "payments":
      return [
        { key: "q", kind: "search", placeholder: "Search payer, email, P-0001 or session…" },
        {
          key: "status",
          kind: "select",
          label: "Status",
          options: [ANY, ["success", "Success"], ["pending", "Pending"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["confirmed", "Confirmed"]],
        },
        {
          key: "kind",
          kind: "select",
          label: "Type",
          options: [ANY, ["subscription", "Premium subscription"], ["publisher_registration", "Publisher fee"]],
        },
        {
          key: "method",
          kind: "select",
          label: "Method",
          options: [ANY, ["bkash", "bKash"], ["nagad", "Nagad"], ["rocket", "Rocket"], ["visa", "Visa"], ["master", "Mastercard"], ["mock", "Test payment"]],
        },
        dates,
        { key: "sort", kind: "select", label: "Sort", options: [...SORT_DATE, ["amount", "Largest amount"]] },
      ];
    case "audit":
      return [
        { key: "q", kind: "search", placeholder: "Search action, target or A-000001…" },
        { key: "actor", kind: "search", placeholder: "Actor: name, U-0001 or “system”…" },
        {
          key: "group",
          kind: "select",
          label: "Area",
          options: [["", "All areas"], ...auditGroups.map((g): [string, string] => [g, label(g)])],
        },
        dates,
        { key: "sort", kind: "select", label: "Sort", options: SORT_DATE },
      ];
    case "finance":
      return [{ kind: "dates", label: "Days from" }];
    default:
      return [];
  }
}

export function App() {
  const [user, setUser] = useState<Row | null>(null);
  const [restoring, setRestoring] = useState(() => !!getToken());
  const [page, setPage] = useState(() => {
    const key = window.location.hash.replace(/^#\/?/, "");
    return pageKeys.has(key) ? key : "summary";
  });
  const [rows, setRows] = useState<any>(null);
  const [extra, setExtra] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<Filters>({});
  const debouncedFilters = useDebounced(filters, 300);
  const [number, setNumber] = useState(1);
  const [decision, setDecision] = useState<{ path: string; action: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [audio, setAudio] = useState<Row[]>([]);
  const [document, setDocument] = useState("");
  const [plan, setPlan] = useState<Row | null>(null);
  const [payment, setPayment] = useState<Row | null>(null);
  const [auditEntry, setAuditEntry] = useState<Row | null>(null);
  const [attention, setAttention] = useState<Record<string, number>>({});
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [recordUser, setRecordUser] = useState<string | null>(null);
  const [auditGroups, setAuditGroups] = useState<string[]>([]);
  const requestSequence = useRef(0);

  // Restore the saved session on load, and renew it so it never runs out while used.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!getToken()) return;
    (async () => {
      try {
        const me = await request("/auth/me");
        if (me?.account_type !== "admin") throw new Error("Not an administrator");
        setUser(me);
        request("/auth/session/renew", "POST")
          .then((fresh) => fresh?.access_token && setToken(fresh.access_token))
          .catch(() => {});
      } catch {
        setToken("");
      } finally {
        setRestoring(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", page === "summary" ? window.location.pathname : `#/${page}`);
  }, [page]);

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
    request("/admin/audit/groups")
      .then((groups) => Array.isArray(groups) && setAuditGroups(groups))
      .catch(() => {});
    const timer = setInterval(loadAttention, 30_000);
    return () => clearInterval(timer);
  }, [user]);
  const pendingTotal = Object.values(attention).reduce((a, b) => a + b, 0);

  function open(key: string) {
    setPage(key);
    setRows(null);
    setExtra(null);
    setFilters({});
    setNumber(1);
    setNotice("");
    setError("");
    setAlertsOpen(false);
  }

  function endpoint() {
    const params = { ...debouncedFilters, page: number };
    if (page === "finance") return `/admin/finance`;
    if (page === "settings" || page === "summary" || page === "plans") return `/admin/${page}`;
    return `/admin/${page}${query(params)}`;
  }

  async function load() {
    if (selfLoading.has(page) || page === "adjustments") return;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError("");
    try {
      const [result, more] = await Promise.all([
        request(endpoint()),
        page === "payments"
          ? request(`/admin/payments/summary${query({ date_from: debouncedFilters.date_from, date_to: debouncedFilters.date_to })}`)
          : page === "finance"
            ? request(`/admin/finance/daily${query({ date_from: debouncedFilters.date_from, date_to: debouncedFilters.date_to })}`)
            : Promise.resolve(null),
      ]);
      if (sequence === requestSequence.current) {
        setRows(result);
        setExtra(more);
      }
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
    if (!user) return;
    load();
    return () => {
      requestSequence.current++;
    };
  }, [user, page, number, debouncedFilters, reloadKey]);

  /** Header Refresh: reload this page and the badges, with visible progress. */
  async function refresh() {
    if (syncing) return;
    setSyncing(true);
    setNotice("");
    const started = Date.now();
    setReloadKey((k) => k + 1);
    await loadAttention();
    // Let the self-loading pages finish; keep the spinner visible long enough to notice.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))));
    setSyncing(false);
    setSyncedAt(new Date());
  }

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
      if (!data.chapters.length) setNotice("No audio chunks are available yet.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeFilters(next: Filters) {
    setFilters(next);
    setNumber(1);
  }

  if (restoring) {
    return (
      <div className="boot" role="status">
        <img className="brand-mark" src="/logo.svg" alt="" />
        <span>Restoring your session…</span>
      </div>
    );
  }
  if (!user) return <Login onLogin={setUser} />;
  const title = navigation.find((n) => n[1] === page)?.[0] || "";
  const fields = filterFields(page, auditGroups);
  const isList = Array.isArray(rows) && !selfLoading.has(page);

  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            open("summary");
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
                    <span className="nav-badge" aria-label={`${attention[key]} pending`}>
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
            {syncedAt && !syncing && (
              <span className="synced" role="status">
                <Icon name="check" size={14} /> Updated {syncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
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
                        <button key={key} role="menuitem" className="alerts-item" onClick={() => open(key)}>
                          <span>{attentionLabels[key] ?? label(key)}</span>
                          <span className="nav-badge">{n}</span>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
            <button className="secondary refresh" disabled={syncing} onClick={refresh} aria-busy={syncing}>
              <Icon name="refresh" className={syncing || busy ? "spin" : ""} />
              {syncing ? "Syncing…" : "Refresh"}
            </button>
          </div>
        </header>
        {(syncing || busy) && <div className="progress-bar" aria-hidden="true" />}
        {page === "summary" && <p className="lead">Platform health and the work waiting for review.</p>}
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
        {fields.length > 0 && <FilterBar fields={fields} values={filters} onChange={changeFilters} />}
        {busy && !rows && <p role="status">Loading…</p>}
        {rows && page === "summary" && (
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
                        <button className="info" onClick={() => open(key)}>
                          Review
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </>
        )}
        {rows && page === "settings" && (
          <form
            className="panel form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate("/admin/settings", "PUT", rows);
            }}
          >
            <div className="full">
              <h2>Generation & revenue policy</h2>
              <p>Quotas reset on calendar months in Asia/Dhaka. Retries within a request do not consume another slot.</p>
            </div>
            {Object.entries(rows).map(([key, value]) => (
              <label key={key}>
                {label(key)}
                {key === "revenue_base" ? (
                  <select value={String(value)} disabled>
                    <option value="gross_confirmed_subscription_receipts">Confirmed subscription receipts (gross)</option>
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
                        [key]: key === "publisher_fee" ? e.target.value : Number(e.target.value),
                      })
                    }
                  />
                )}
              </label>
            ))}
            <div className="full">
              <p>
                Registration fees are excluded from the publisher pool. Taxes, gateway fees and refunds require an
                explicit accounting policy before production.
              </p>
              <button disabled={busy}>Save policy</button>
            </div>
          </form>
        )}
        {rows && page === "finance" && (
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
            <section className="panel">
              <h2>Daily publisher earnings</h2>
              <p>
                Every finished day, the publisher share of that day's Premium income is split by that day's eligible
                listens and added to the publishers' balances. A day without listens keeps its pool unallocated.
              </p>
              <DataTable
                rows={Array.isArray(extra) ? extra : []}
                columns={["day", "revenue", "publisher_pool", "allocated", "listens"]}
                render={{
                  revenue: (r) => money(r.revenue),
                  publisher_pool: (r) => money(r.publisher_pool),
                  allocated: (r) => money(r.allocated),
                }}
              />
            </section>
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
              <p>Snapshots are immutable. Months with daily earnings only sum up what was already credited.</p>
            </form>
            <DataTable
              rows={rows.snapshots}
              columns={["month", "revenue", "publisher_pool", "platform_share", "created_at"]}
              render={{
                revenue: (r) => money(r.revenue),
                publisher_pool: (r) => money(r.publisher_pool),
                platform_share: (r) => money(r.platform_share),
              }}
            />
          </>
        )}
        {page === "adjustments" && <AdjustmentForm submit={async (body) => mutate("/admin/adjustments", "POST", body)} />}
        {page === "reports" && <ReportsPage listen={listen} onChanged={loadAttention} reloadKey={reloadKey} />}
        {page === "appeals" && <AppealsPage listen={listen} onChanged={loadAttention} reloadKey={reloadKey} />}
        {page === "withdrawals" && <WithdrawalsPage onChanged={loadAttention} reloadKey={reloadKey} />}
        {page === "payments" && extra && <PaymentTotals totals={extra} />}
        {isList && (
          <>
            {page === "plans" && (
              <button onClick={() => setPlan({ name: "", months: 1, price: "150.00", active: true })}>
                Add subscription plan
              </button>
            )}
            <DataTable
              rows={rows}
              columns={columns[page] || []}
              render={renderersFor(page)}
              actions={(row) => (
                <div className="actions">
                  {page === "users" && row.account_type !== "admin" && (
                    <>
                      <button className="info" onClick={() => setRecordUser(row.id)}>
                        <Icon name="shield" size={14} />
                        Record
                      </button>
                      <button
                        className={row.suspended ? "success" : "warn"}
                        onClick={() =>
                          decide(`/admin/users/${row.id}/decision`, row.suspended ? "unsuspend" : "suspend", row.email)
                        }
                      >
                        <Icon name={row.suspended ? "check" : "block"} size={14} />
                        {row.suspended ? "Unsuspend" : "Suspend"}
                      </button>
                    </>
                  )}
                  {page === "applications" && (
                    <>
                      <button
                        className="info"
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
                            className="success"
                            onClick={() => decide(`/admin/applications/${row.id}/decision`, "approve", row.legal_name)}
                          >
                            Approve
                          </button>
                          <button
                            className="danger"
                            onClick={() => decide(`/admin/applications/${row.id}/decision`, "reject", row.legal_name)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {["audiobooks", "channels"].includes(page) && (
                    <>
                      {page === "audiobooks" && (
                        <button className="info" onClick={() => listen(row.id)}>
                          <Icon name="play" size={14} />
                          Listen
                        </button>
                      )}
                      <button
                        className={row.moderated ? "success" : "warn"}
                        onClick={() =>
                          decide(`/admin/moderation/${page}/${row.id}`, row.moderated ? "restore" : "restrict", row.title || row.name)
                        }
                      >
                        {row.moderated ? "Restore" : "Restrict"}
                      </button>
                    </>
                  )}
                  {page === "plans" && (
                    <button className="info" onClick={() => setPlan({ ...row })}>
                      <Icon name="edit" size={14} />
                      Edit
                    </button>
                  )}
                  {page === "payments" && (
                    <button className="info" onClick={() => setPayment(row)}>
                      <Icon name="eye" size={14} />
                      Details
                    </button>
                  )}
                  {page === "audit" && (
                    <button className="info" onClick={() => setAuditEntry(row)}>
                      <Icon name="eye" size={14} />
                      Details
                    </button>
                  )}
                </div>
              )}
            />
            {page !== "plans" && (
              <div className="pagination">
                <button className="secondary" disabled={number === 1} onClick={() => setNumber(number - 1)}>
                  Previous
                </button>
                <span>Page {number}</span>
                <button className="secondary" disabled={rows.length < 50} onClick={() => setNumber(number + 1)}>
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
        <Modal title={`${label(decision.action)} · ${decision.name}`} close={() => setDecision(null)}>
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
                <p>The member receives this reason in their notifications. The decision is recorded in the audit history.</p>
              </>
            ) : (
              <p>
                {consequences[decision.action] ?? "Confirm this decision."} The decision is recorded in the audit history.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setDecision(null)}>
                Cancel
              </button>
              <button disabled={busy} className={intent[decision.action] ?? ""}>
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
              if (await mutate(`/admin/plans${plan.id ? `/${plan.id}` : ""}`, plan.id ? "PUT" : "POST", { name, months, price, active }))
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
                  onChange={(e) => setPlan({ ...plan, [key]: key === "months" ? Number(e.target.value) : e.target.value })}
                />
              </label>
            ))}
            <label>
              Available
              <select value={String(plan.active)} onChange={(e) => setPlan({ ...plan, active: e.target.value === "true" })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <button disabled={busy}>Save plan</button>
          </form>
        </Modal>
      )}
      {payment && <PaymentDetails row={payment} close={() => setPayment(null)} />}
      {auditEntry && (
        <Modal title={`Audit entry ${auditId(auditEntry.serial)}`} close={() => setAuditEntry(null)}>
          <dl className="facts">
            <dt>When</dt>
            <dd>{dateTime(auditEntry.created_at)}</dd>
            <dt>Action</dt>
            <dd>
              <span className="badge">{auditEntry.action}</span>
            </dd>
            <dt>Done by</dt>
            <dd>{auditEntry.actor ? memberLabel(auditEntry.actor) : "System"}</dd>
            <dt>Target</dt>
            <dd className="mono">{auditEntry.target_member ? memberLabel(auditEntry.target_member) : auditEntry.target}</dd>
          </dl>
          <h4>Details</h4>
          <Details value={auditEntry.details} full />
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
      {recordUser && <UserRecordModal userId={recordUser} close={() => setRecordUser(null)} />}
      {document && (
        <Modal title="Publisher verification document" close={() => setDocument("")} wide>
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
  users: ["serial", "username", "email", "account_type", "publisher_status", "premium", "published_books", "suspended", "created_at"],
  applications: ["legal_name", "member", "status", "reason", "created_at"],
  audiobooks: ["title", "owner", "channel_name", "access_tier", "status", "publication_status", "moderated", "created_at"],
  channels: ["serial", "name", "owner", "followers", "audiobooks", "moderated", "created_at"],
  plans: ["name", "months", "price", "active"],
  payments: ["serial", "payer", "kind", "plan_name", "amount", "method_label", "status", "created_at"],
  adjustments: ["created_at", "order_id", "kind", "amount", "reason"],
  audit: ["serial", "created_at", "action", "actor", "target", "details"],
};

const KIND_LABELS: Record<string, string> = {
  subscription: "Premium subscription",
  publisher_registration: "Publisher fee",
};

/** Page-specific cells; anything else uses DataTable's default formatting. */
const serialFormat: Record<string, (value: unknown) => string> = {
  users: memberId,
  channels: channelId,
  payments: paymentId,
  audit: auditId,
};
const renderersFor = (page: string): Record<string, (row: Row) => React.ReactNode> => ({
  ...renderers,
  serial: (r) => <span className="mono">{(serialFormat[page] ?? memberId)(r.serial)}</span>,
});

const renderers: Record<string, (row: Row) => React.ReactNode> = {
  title: (r) => (
    <>
      <strong>{r.title}</strong>
      {r.author && <div className="subtle">{r.author}</div>}
    </>
  ),
  owner: (r) => <span>{memberLabel(r.owner)}</span>,
  payer: (r) =>
    r.user ? (
      <>
        <span className="mono">{memberId(r.user.serial)}</span> {r.user.username}
        <div className="subtle">{r.user.email}</div>
      </>
    ) : (
      "—"
    ),
  kind: (r) => KIND_LABELS[r.kind] ?? label(String(r.kind)),
  amount: (r) => <strong>{money(r.amount)}</strong>,
  price: (r) => money(r.price),
  plan_name: (r) => r.plan_name ?? (r.kind === "publisher_registration" ? "—" : `${r.months} month(s)`),
  method_label: (r) => <span className="badge method">{r.method_label}</span>,
  premium: (r) => (r.premium ? <span className="badge premium">Premium</span> : "No"),
  suspended: (r) => (r.suspended ? <span className="badge rejected">Suspended</span> : "No"),
  moderated: (r) => (r.moderated ? <span className="badge rejected">Restricted</span> : "No"),
  actor: (r) => (r.actor ? memberLabel(r.actor) : <span className="subtle">System</span>),
  target: (r) =>
    r.target_member ? (
      memberLabel(r.target_member)
    ) : (
      <span className="mono subtle" title={r.target}>
        {String(r.target).length > 12 ? `${String(r.target).slice(0, 8)}…` : r.target}
      </span>
    ),
  details: (r) => <Details value={r.details} />,
  action: (r) => <span className="badge">{r.action}</span>,
};

/** Audit details as readable key/value chips (the full JSON is in the Details dialog). */
function Details({ value, full = false }: { value: unknown; full?: boolean }) {
  if (!value || typeof value !== "object" || !Object.keys(value as object).length) return <span className="subtle">—</span>;
  const entries = Object.entries(value as Row);
  const shown = full ? entries : entries.slice(0, 4);
  return (
    <dl className={full ? "facts" : "kv"}>
      {shown.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{label(k)}</dt>
          <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </React.Fragment>
      ))}
      {!full && entries.length > shown.length && <dd className="subtle">+{entries.length - shown.length} more</dd>}
    </dl>
  );
}

function PaymentTotals({ totals }: { totals: Record<string, { count: number; amount: string }> }) {
  const order = ["success", "pending", "failed", "cancelled", "confirmed"];
  const keys = Object.keys(totals).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!keys.length) return null;
  return (
    <div className="metrics compact">
      {keys.map((status) => (
        <article key={status}>
          <span>
            <span className={`badge ${status}`}>{label(status)}</span> · {totals[status].count} payment(s)
          </span>
          <strong>{money(totals[status].amount)}</strong>
        </article>
      ))}
    </div>
  );
}

function PaymentDetails({ row, close }: { row: Row; close: () => void }) {
  return (
    <Modal title={`Payment ${paymentId(row.serial)}`} close={close}>
      <dl className="facts">
        <dt>Paid by</dt>
        <dd>
          {row.user ? (
            <>
              {memberLabel(row.user)}
              <div className="subtle">{row.user.email}</div>
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt>Amount</dt>
        <dd>
          <strong>{money(row.amount)}</strong>
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={`badge ${row.status}`}>{label(row.status)}</span>
        </dd>
        <dt>For</dt>
        <dd>
          {KIND_LABELS[row.kind] ?? row.kind}
          {row.plan_name ? ` · ${row.plan_name}` : row.months ? ` · ${row.months} month(s)` : ""}
        </dd>
        <dt>Method</dt>
        <dd>
          {row.method_label}
          {row.method && row.method !== row.method_label ? <span className="subtle"> ({row.method})</span> : null}
        </dd>
        <dt>Gateway</dt>
        <dd>{row.provider}</dd>
        <dt>Created</dt>
        <dd>{dateTime(row.created_at)}</dd>
        <dt>Last update</dt>
        <dd>{dateTime(row.updated_at)}</dd>
        <dt>Transaction ID</dt>
        <dd className="mono">{row.id}</dd>
        {row.gateway_session && (
          <>
            <dt>Gateway session</dt>
            <dd className="mono">{row.gateway_session}</dd>
          </>
        )}
      </dl>
    </Modal>
  );
}

function DataTable({
  rows,
  columns,
  actions,
  render = {},
}: {
  rows: Row[];
  columns: string[];
  actions?: (row: Row) => React.ReactNode;
  render?: Record<string, (row: Row) => React.ReactNode>;
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
              <tr key={row.id || row.month || row.day || i}>
                {columns.map((c) => (
                  <td key={c}>
                    {render[c] ? (
                      render[c](row)
                    ) : c === "member" ? (
                      <span className="mono">{memberId(row[c])}</span>
                    ) : c.endsWith("_at") ? (
                      dateTime(row[c])
                    ) : ["status", "publisher_status", "account_type", "access_tier", "publication_status"].includes(c) ? (
                      <span className={`badge ${row[c]}`}>{label(String(row[c]))}</span>
                    ) : typeof row[c] === "object" && row[c] !== null ? (
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
        <p>Sign in with your dedicated administrator account. You stay signed in on this browser until you sign out.</p>
        <label>
          Email or username
          <input name="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <small>Administrator accounts are provisioned by the platform operator.</small>
      </form>
    </div>
  );
}

function AdjustmentForm({ submit }: { submit: (body: unknown) => Promise<boolean> }) {
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
          if (await submit({ ...data, reference: crypto.randomUUID() })) form.reset();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="full">
        <h2>Record a simulated deduction</h2>
        <p>
          Only confirmed orders in an unclosed month are eligible. Deductions reduce that month's distributable
          subscription receipts. Entitlements remain until paid expiry; no external transfer occurs.
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
      <button disabled={busy} className="warn">
        Record deduction
      </button>
    </form>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
