/**
 * Moderation: content reports dashboard, report case view with independent
 * actions, appeals queue and account moderation records.
 */
import React, { useEffect, useRef, useState } from "react";
import { query, request } from "./api";
import { FilePreview, FilterBar, FilterField, Filters, Icon, Modal, Row, dateTime, memberId, useDebounced } from "./ui";

export const CATEGORY_LABELS: Record<string, string> = {
  sexual_content: "Sexual content",
  copyright: "Copyright violation",
  plagiarism: "Plagiarism",
  fake_account: "Fake account",
  illegal: "Illegal content",
  harassment: "Harassment",
  misleading: "Misleading content",
  other: "Other",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under review",
  action_taken: "Action taken",
  appealed: "Appealed",
  resolved: "Resolved",
  dismissed: "Dismissed",
  accepted: "Accepted",
  rejected: "Rejected",
};
const APPEAL_REASONS: Record<string, string> = {
  own_rights: "I own the rights",
  have_permission: "I have permission",
  original_work: "It is my original work",
  report_mistaken: "The report is mistaken",
  other: "Other",
};
const ACTION_LABELS: Record<string, string> = {
  notify: "Notice sent",
  hide: "Content hidden",
  restrict: "Publishing restricted",
  flag: "Account flagged (internal)",
  strike: "Strike recorded",
  delete: "Content deleted",
  suspend: "Account suspended",
};

const caseId = (id: string) => `R-${id.slice(0, 8).toUpperCase()}`;
const who = (p: Row | null | undefined) =>
  p ? `${memberId(p.serial)} · ${p.username}` : "—";

function Status({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  return (
    <span className={`badge ${value}`}>{STATUS_LABELS[value] ?? value}</span>
  );
}

/** Evidence files as buttons that preview inside the case window. */
function EvidenceList({ files }: { files: Row[] }) {
  const [shown, setShown] = useState<Row | null>(null);
  return (
    <>
      <ul className="files">
        {files.map((f: Row) => (
          <li key={f.id}>
            <button
              className={`link ${shown?.id === f.id ? "active" : ""}`}
              onClick={() => setShown(shown?.id === f.id ? null : f)}
              aria-expanded={shown?.id === f.id}
            >
              <Icon name="eye" size={14} />
              {f.filename}
            </button>
          </li>
        ))}
      </ul>
      {shown && (
        <FilePreview path={`/admin/moderation/evidence/${shown.id}`} name={shown.filename} onClose={() => setShown(null)} />
      )}
    </>
  );
}

/** List page state: filters (debounced), page number and a reload on Refresh. */
function useListPage<T>(path: string, initial: Filters, reloadKey: number) {
  const [filters, setFilters] = useState<Filters>(initial);
  const debounced = useDebounced(filters, 300);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  async function load() {
    const current = ++sequence.current;
    setError("");
    try {
      const result = await request(`${path}${query({ ...debounced, page })}`);
      if (current === sequence.current) setRows(result);
    } catch (e) {
      if (current === sequence.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [debounced, page, reloadKey]);
  return {
    filters,
    setFilters: (next: Filters) => {
      setFilters(next);
      setPage(1);
    },
    page,
    setPage,
    rows,
    error,
    load,
  };
}

function Pager({ page, setPage, count }: { page: number; setPage: (n: number) => void; count: number }) {
  return (
    <div className="pagination">
      <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span>Page {page}</span>
      <button className="secondary" disabled={count < 50} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

const REPORT_FILTERS: FilterField[] = [
  { key: "q", kind: "search", placeholder: "Search reporter, owner, U-0001 or title…" },
  {
    key: "status",
    kind: "select",
    label: "Status",
    options: [
      ["open", "Open (pending and under review)"],
      ["action_taken", "Action taken"],
      ["appealed", "Appealed"],
      ["resolved", "Resolved"],
      ["dismissed", "Dismissed"],
      ["", "All reports"],
    ],
  },
  { key: "category", kind: "select", label: "Category", options: [["", "Any"], ...Object.entries(CATEGORY_LABELS)] },
  { kind: "dates" },
  {
    key: "sort",
    kind: "select",
    label: "Sort",
    options: [
      ["newest", "Newest first"],
      ["oldest", "Oldest first"],
    ],
  },
];

// ── Reports dashboard ───────────────────────────────────────────────────────

export function ReportsPage({
  listen,
  onChanged,
  reloadKey = 0,
}: {
  listen: (id: string) => void;
  onChanged: () => void;
  reloadKey?: number;
}) {
  const list = useListPage<Row>("/admin/reports", { status: "open" }, reloadKey);
  const { rows, error } = list;
  const load = list.load;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <FilterBar fields={REPORT_FILTERS} values={list.filters} onChange={list.setFilters} />
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Reported by</th>
              <th>Reported content</th>
              <th>Content owner</th>
              <th>Category</th>
              <th>Description</th>
              <th>Report date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty">Loading…</div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty">No reports here.</div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{caseId(r.id)}</td>
                  <td>{who(r.reporter)}</td>
                  <td>
                    <strong>{r.audiobook?.title ?? "Deleted audiobook"}</strong>
                    {r.same_content_reports > 1 && (
                      <div className="subtle">
                        {r.same_content_reports} reports on this audiobook
                      </div>
                    )}
                  </td>
                  <td>
                    {who(r.owner)}
                    {r.owner?.strikes ? (
                      <div className="subtle">{r.owner.strikes} strike(s)</div>
                    ) : null}
                  </td>
                  <td>{r.category_label}</td>
                  <td className="clip">{r.details || "—"}</td>
                  <td>{dateTime(r.created_at)}</td>
                  <td>
                    <Status value={r.status} />
                    {r.appeal_status && (
                      <div className="subtle">
                        Appeal: {STATUS_LABELS[r.appeal_status]}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button className="info" onClick={() => setOpen(r.id)}>
                        <Icon name="eye" size={14} />
                        Open
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows && <Pager page={list.page} setPage={list.setPage} count={rows.length} />}
      {open && (
        <ReportCase
          id={open}
          listen={listen}
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

// ── Appeals queue ───────────────────────────────────────────────────────────

const APPEAL_FILTERS: FilterField[] = [
  { key: "q", kind: "search", placeholder: "Search owner, U-0001 or title…" },
  {
    key: "status",
    kind: "select",
    label: "Status",
    options: [
      ["pending", "Pending"],
      ["accepted", "Accepted"],
      ["rejected", "Rejected"],
      ["", "All appeals"],
    ],
  },
  { kind: "dates" },
  {
    key: "sort",
    kind: "select",
    label: "Sort",
    options: [
      ["newest", "Newest first"],
      ["oldest", "Oldest first"],
    ],
  },
];

export function AppealsPage({
  listen,
  onChanged,
  reloadKey = 0,
}: {
  listen: (id: string) => void;
  onChanged: () => void;
  reloadKey?: number;
}) {
  const list = useListPage<Row>("/admin/appeals", { status: "pending" }, reloadKey);
  const { rows, error, load } = list;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <FilterBar fields={APPEAL_FILTERS} values={list.filters} onChange={list.setFilters} />
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Content owner</th>
              <th>Audiobook</th>
              <th>Violation</th>
              <th>Appeal reason</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!rows || rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">
                    {rows ? "No appeals here." : "Loading…"}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{caseId(a.report_id)}</td>
                  <td>{who(a.owner)}</td>
                  <td>{a.audiobook?.title ?? "—"}</td>
                  <td>{CATEGORY_LABELS[a.violation] ?? a.violation}</td>
                  <td>{APPEAL_REASONS[a.reason] ?? a.reason}</td>
                  <td>{dateTime(a.created_at)}</td>
                  <td>
                    <Status value={a.status} />
                  </td>
                  <td>
                    <div className="actions">
                      <button className="info" onClick={() => setOpen(a.report_id)}>
                        <Icon name="eye" size={14} />
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows && <Pager page={list.page} setPage={list.setPage} count={rows.length} />}
      {open && (
        <ReportCase
          id={open}
          listen={listen}
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

// ── One case ────────────────────────────────────────────────────────────────

type Pane = null | "actions" | "dismiss" | "confirm" | "accept" | "reject" | "email";

function ReportCase({
  id,
  close,
  listen,
  onChanged,
}: {
  id: string;
  close: () => void;
  listen: (id: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>(null);
  // Action form
  const [violation, setViolation] = useState("other");
  const [notify, setNotify] = useState(true);
  const [hide, setHide] = useState(false);
  const [restrict, setRestrict] = useState(false);
  const [days, setDays] = useState(7);
  const [flag, setFlag] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [deleteContent, setDeleteContent] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [notifyReporters, setNotifyReporters] = useState(true);
  const [notice, setNotice] = useState("");
  const side = useRef<HTMLElement>(null);

  /** Open a form in the side column, right where the buttons were, and bring it into view. */
  function openPane(next: Pane) {
    setNotice("");
    setPane(next);
    requestAnimationFrame(() => side.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  async function load() {
    try {
      const detail = await request(`/admin/reports/${id}`);
      setData(detail);
      setViolation(detail.violation || detail.category || "other");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [id]);

  async function send(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, "POST", body);
      setPane(null);
      setNote("");
      setConfirmText("");
      setDeleteContent(false);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Modal title="Report" close={close} wide>
        {error ? <div className="error">{error}</div> : <p>Loading…</p>}
      </Modal>
    );
  }

  const open = data.status === "pending" || data.status === "under_review";
  const appeal = data.appeal;
  const record = data.owner_record;
  const deadline = data.appeal_deadline ? new Date(data.appeal_deadline) : null;
  const windowClosed = deadline ? deadline < new Date() : false;
  const deletion = (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={deleteContent}
          onChange={(e) => setDeleteContent(e.target.checked)}
        />
        Also delete the audiobook (soft delete; records and evidence are kept)
      </label>
      {deleteContent && (
        <label>
          Type DELETE to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </label>
      )}
    </>
  );

  return (
    <Modal title={`Report ${caseId(data.id)}`} close={close} wide>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="case-grid">
        <div className="case-main">
          <section className="case-section">
            <div className="case-head">
              <div>
                <h3>{data.audiobook?.title ?? "Deleted audiobook"}</h3>
                <p className="subtle">
                  {data.audiobook?.author ? `${data.audiobook.author} · ` : ""}
                  {data.audiobook?.access_tier} ·{" "}
                  {data.audiobook?.moderated ? "Hidden" : "Visible"}
                  {data.audiobook?.publication_status === "deleted"
                    ? " · Deleted"
                    : ""}
                </p>
              </div>
              <Status value={data.status} />
            </div>
            {data.audiobook && (
              <button
                className="info"
                onClick={() => listen(data.audiobook.id)}
              >
                <Icon name="play" size={14} />
                Listen
              </button>
            )}
            <dl className="facts">
              <dt>Category</dt>
              <dd>{data.category_label}</dd>
              <dt>Reported by</dt>
              <dd>
                {who(data.reporter)}
                {data.reporter?.email && <div className="subtle">{data.reporter.email}</div>}
                {data.reporter_dismissed_reports > 0 && (
                  <span className="subtle">
                    {" "}
                    · {data.reporter_dismissed_reports} earlier report(s)
                    dismissed
                  </span>
                )}
              </dd>
              <dt>Content owner</dt>
              <dd>
                {who(data.owner)}
                {data.owner?.email && <div className="subtle">{data.owner.email}</div>}
              </dd>
              <dt>Report date</dt>
              <dd>{dateTime(data.created_at)}</dd>
              {data.violation && (
                <>
                  <dt>Violation</dt>
                  <dd>{CATEGORY_LABELS[data.violation]}</dd>
                </>
              )}
              {deadline && (
                <>
                  <dt>Appeal deadline</dt>
                  <dd>
                    {dateTime(data.appeal_deadline)}
                    {windowClosed && <span className="subtle"> · closed</span>}
                  </dd>
                </>
              )}
            </dl>
            <h4>Reporter's explanation</h4>
            <p className="quote">{data.details || "No explanation given."}</p>
            {data.evidence.length > 0 && (
              <>
                <h4>Evidence</h4>
                <EvidenceList files={data.evidence} />
              </>
            )}
          </section>

          {data.other_reports.length > 0 && (
            <section className="case-section">
              <h4>
                Other reports on this audiobook ({data.other_reports.length})
              </h4>
              <ul className="timeline">
                {data.other_reports.map((o: Row) => (
                  <li key={o.id}>
                    <span className="mono">{caseId(o.id)}</span>{" "}
                    {CATEGORY_LABELS[o.category]} by {who(o.reporter)} ·{" "}
                    {dateTime(o.created_at)} · <Status value={o.status} />
                    {o.details && <div className="subtle">{o.details}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {appeal && (
            <section className="case-section highlight">
              <div className="case-head">
                <h4>Appeal</h4>
                <Status value={appeal.status} />
              </div>
              <dl className="facts">
                <dt>Reason</dt>
                <dd>{APPEAL_REASONS[appeal.reason] ?? appeal.reason}</dd>
                <dt>Submitted</dt>
                <dd>{dateTime(appeal.created_at)}</dd>
              </dl>
              <p className="quote">{appeal.explanation}</p>
              {appeal.evidence.length > 0 && <EvidenceList files={appeal.evidence} />}
              {appeal.decision_note && (
                <p className="subtle">Decision note: {appeal.decision_note}</p>
              )}
            </section>
          )}

          {data.actions.length > 0 && (
            <section className="case-section">
              <h4>Actions taken</h4>
              <ul className="timeline">
                {data.actions.map((a: Row) => (
                  <li key={a.id} className={a.reversed ? "reversed" : ""}>
                    {ACTION_LABELS[a.kind] ?? a.kind}
                    {a.details?.days ? ` · ${a.details.days} days` : ""}
                    {a.details?.total ? ` · total ${a.details.total}` : ""}
                    {a.details?.note ? ` · ${a.details.note}` : ""}
                    <span className="subtle"> · {dateTime(a.created_at)}</span>
                    {a.reversed && <span className="badge">Reversed</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="case-section">
            <h4>Moderation history</h4>
            <ul className="timeline">
              {data.history.map((h: Row) => (
                <li key={h.id}>
                  <strong>
                    {h.action
                      .replace("moderation.", "")
                      .replaceAll(".", " ")
                      .replaceAll("_", " ")}
                  </strong>
                  {h.details?.previous_status &&
                    ` · ${h.details.previous_status} to ${h.details.new_status}`}
                  {h.details?.note ? ` · ${h.details.note}` : ""}
                  <span className="subtle">
                    {" "}
                    · {h.actor ? h.actor.username : "system"} ·{" "}
                    {dateTime(h.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="case-side" ref={side}>
          {!pane && (
          <section className="case-section">
            <h4>Decision</h4>
            <div className="stack">
              {data.status === "pending" && (
                <button
                  className="info"
                  disabled={busy}
                  onClick={() => send(`/admin/reports/${id}/review`, {})}
                >
                  Start review
                </button>
              )}
              {(open || data.status === "action_taken") && (
                <button className="warn" disabled={busy} onClick={() => openPane("actions")}>
                  Take action
                </button>
              )}
              {open && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => openPane("dismiss")}
                >
                  Dismiss report
                </button>
              )}
              {(open || data.status === "action_taken") && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => openPane("confirm")}
                >
                  Confirm violation
                </button>
              )}
              <button className="info" disabled={busy} onClick={() => openPane("email")}>
                <Icon name="mail" size={14} />
                Email owner / reporter
              </button>
              {data.status === "action_taken" && windowClosed && (
                <p className="subtle">
                  The appeal window has closed. The case can be finalised.
                </p>
              )}
              {appeal?.status === "pending" && (
                <>
                  <button className="success" disabled={busy} onClick={() => openPane("accept")}>
                    Accept appeal
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => openPane("reject")}
                  >
                    Reject appeal
                  </button>
                </>
              )}
              {!open && !["action_taken", "appealed"].includes(data.status) && (
                <p className="subtle">This case is closed.</p>
              )}
              {notice && <p className="notice small">{notice}</p>}
            </div>
          </section>
          )}

          {pane === "email" && (
            <EmailPane
              reportId={id}
              hasReporter={!!data.reporter && data.reporter.id !== data.owner?.id}
              cancel={() => setPane(null)}
              sent={(message) => {
                setPane(null);
                setNotice(message);
                load();
              }}
            />
          )}

      {pane === "actions" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send(`/admin/reports/${id}/actions`, {
              violation,
              notify,
              hide,
              restrict_days: restrict ? days : null,
              flag_note: flag ? flagNote : "",
              message,
              note,
              notify_reporters: notifyReporters,
            });
          }}
        >
          <h4>Take action</h4>
          <label>
            Violation
            <select
              value={violation}
              onChange={(e) => setViolation(e.target.value)}
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p className="subtle">
            Each action is independent. The owner's notice lists only what you
            select.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            Notify the owner (moderation notice with a 7-day appeal window)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={notifyReporters}
              onChange={(e) => setNotifyReporters(e.target.checked)}
            />
            Tell the reporter(s) that action was taken
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hide}
              onChange={(e) => setHide(e.target.checked)}
            />
            Hide the audiobook from public feeds and search
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={restrict}
              onChange={(e) => setRestrict(e.target.checked)}
            />
            Restrict publishing for
            <select
              value={days}
              disabled={!restrict}
              onChange={(e) => setDays(Number(e.target.value))}
              className="inline"
            >
              {[3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={flag}
              onChange={(e) => setFlag(e.target.checked)}
            />
            Flag the account (visible to admins only)
          </label>
          {flag && (
            <label>
              Flag note
              <input
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                required
                minLength={3}
              />
            </label>
          )}
          <label>
            Message to the owner (optional)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label>
            Internal note (audit log only)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setPane(null)}
            >
              Cancel
            </button>
            <button disabled={busy || !(notify || hide || restrict || flag)}>
              Apply actions
            </button>
          </div>
        </form>
      )}

      {pane === "dismiss" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send(`/admin/reports/${id}/dismiss`, { note });
          }}
        >
          <h4>Dismiss report</h4>
          <p>
            No violation was found. Other open reports on this audiobook are
            dismissed too. No penalty is applied.
          </p>
          <label>
            Internal note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setPane(null)}
            >
              Cancel
            </button>
            <button disabled={busy}>Dismiss</button>
          </div>
        </form>
      )}

      {pane === "confirm" && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send(`/admin/reports/${id}/confirm`, {
              delete_content: deleteContent,
              confirm: confirmText,
              note,
            });
          }}
        >
          <h4>Confirm violation</h4>
          <p>
            Records a strike and applies the strike policy (2nd strike: 7-day
            restriction, 3rd: 30 days, 4th: permanent suspension). Use it after
            the appeal window closes, or straight away for serious violations.
          </p>
          {deletion}
          <label>
            Internal note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setPane(null)}
            >
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy || (deleteContent && confirmText !== "DELETE")}
            >
              Confirm violation
            </button>
          </div>
        </form>
      )}

      {(pane === "accept" || pane === "reject") && appeal && (
        <form
          className="decision panel-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send(`/admin/appeals/${appeal.id}/decision`, {
              action: pane,
              note,
              delete_content: pane === "reject" && deleteContent,
              confirm: confirmText,
            });
          }}
        >
          <h4>{pane === "accept" ? "Accept appeal" : "Reject appeal"}</h4>
          <p>
            {pane === "accept"
              ? "The content becomes visible again and every penalty from this case (restriction, flag, strike) is lifted. The owner is notified."
              : "The violation is confirmed: a strike is recorded and the strike policy applies. The owner is notified with your reason."}
          </p>
          {pane === "reject" && deletion}
          <label>
            {pane === "accept"
              ? "Message to the owner (optional)"
              : "Reason (sent to the owner)"}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={pane === "reject"}
              minLength={pane === "reject" ? 3 : 0}
              maxLength={2000}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setPane(null)}
            >
              Cancel
            </button>
            <button
              className={pane === "reject" ? "danger" : ""}
              disabled={
                busy ||
                (pane === "reject" && deleteContent && confirmText !== "DELETE")
              }
            >
              {pane === "accept" ? "Accept appeal" : "Reject appeal"}
            </button>
          </div>
        </form>
      )}

          {record && <RecordSummary record={record} onChanged={load} setError={setError} />}
        </aside>
      </div>
    </Modal>
  );
}

/** Write to the content owner and/or the reporter. It is emailed and kept in their notifications. */
function EmailPane({
  reportId,
  hasReporter,
  cancel,
  sent,
}: {
  reportId: string;
  hasReporter: boolean;
  cancel: () => void;
  sent: (message: string) => void;
}) {
  const [to, setTo] = useState(hasReporter ? "both" : "owner");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="decision panel-inline"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await request(`/admin/reports/${reportId}/email`, "POST", { to, subject, message });
          sent(
            result.mail_configured
              ? `Emailed ${result.emailed} recipient(s) and added it to their notifications.`
              : "Email is not configured on the server, so the message was added to their in-app notifications only.",
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4>Email about this case</h4>
      {error && <div className="error">{error}</div>}
      <label>
        Send to
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="owner">Content owner</option>
          {hasReporter && <option value="reporter">Reporter</option>}
          {hasReporter && <option value="both">Owner and reporter</option>}
        </select>
      </label>
      <label>
        Subject
        <input required minLength={3} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label>
        Message
        <textarea required minLength={3} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <p className="subtle">
        Decisions (actions, dismissals, confirmed violations, appeal results) are emailed automatically; use this for
        anything extra.
      </p>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={cancel}>
          Cancel
        </button>
        <button className="info" disabled={busy}>
          <Icon name="mail" size={14} />
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

// ── Account moderation record ───────────────────────────────────────────────

function RecordSummary({
  record,
  onChanged,
  setError,
}: {
  record: Row;
  onChanged: () => void;
  setError: (m: string) => void;
}) {
  async function post(path: string) {
    try {
      await request(path, "POST", {});
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="case-section">
      <div className="case-head">
        <h4>Owner record</h4>
        <span
          className={`badge ${record.status === "active" ? "active" : record.status === "suspended" ? "rejected" : "pending"}`}
        >
          {record.status === "suspended"
            ? "Permanently banned"
            : record.status === "restricted"
              ? "Restricted"
              : "Active"}
        </span>
      </div>
      <dl className="facts">
        <dt>Confirmed strikes</dt>
        <dd>{record.active_strikes}</dd>
        {record.publishing_restricted_until && (
          <>
            <dt>Restricted until</dt>
            <dd>{dateTime(record.publishing_restricted_until)}</dd>
          </>
        )}
        <dt>Previous violations</dt>
        <dd>{record.violations.length}</dd>
        <dt>Appeals</dt>
        <dd>
          {record.appeals.length
            ? record.appeals.map((a: Row) => STATUS_LABELS[a.status]).join(", ")
            : "None"}
        </dd>
      </dl>
      {record.restrictions
        .filter((r: Row) => r.active)
        .map((r: Row) => (
          <div key={r.id} className="row-item">
            <span>
              Publishing restricted until{" "}
              {r.ends_at ? dateTime(r.ends_at) : "permanently"}
            </span>
            <button
              className="secondary small"
              onClick={() => post(`/admin/restrictions/${r.id}/lift`)}
            >
              Lift
            </button>
          </div>
        ))}
      {record.flags
        .filter((f: Row) => f.active)
        .map((f: Row) => (
          <div key={f.id} className="row-item">
            <span>
              <Icon name="flag" size={13} /> {f.note}
            </span>
            <button
              className="secondary small"
              onClick={() => post(`/admin/flags/${f.id}/remove`)}
            >
              Remove
            </button>
          </div>
        ))}
    </section>
  );
}

export function UserRecordModal({
  userId,
  close,
}: {
  userId: string;
  close: () => void;
}) {
  const [record, setRecord] = useState<Row | null>(null);
  const [error, setError] = useState("");
  async function load() {
    try {
      setRecord(await request(`/admin/users/${userId}/moderation`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [userId]);
  return (
    <Modal
      title={
        record ? `Moderation record · ${who(record.user)}` : "Moderation record"
      }
      close={close}
    >
      {error && <div className="error">{error}</div>}
      {!record ? (
        <p>Loading…</p>
      ) : (
        <>
          <RecordSummary record={record} onChanged={load} setError={setError} />
          <section className="case-section">
            <h4>Strikes</h4>
            {record.strikes.length ? (
              <ul className="timeline">
                {record.strikes.map((s: Row) => (
                  <li key={s.id} className={s.revoked ? "reversed" : ""}>
                    {CATEGORY_LABELS[s.violation] ?? s.violation} ·{" "}
                    {dateTime(s.created_at)}
                    {s.revoked && <span className="badge">Revoked</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtle">No strikes.</p>
            )}
            <h4>Restrictions</h4>
            {record.restrictions.length ? (
              <ul className="timeline">
                {record.restrictions.map((r: Row) => (
                  <li key={r.id} className={r.active ? "" : "reversed"}>
                    {dateTime(r.starts_at)} to{" "}
                    {r.ends_at ? dateTime(r.ends_at) : "permanent"} · {r.reason}
                    {r.lifted && <span className="badge">Lifted</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtle">No restrictions.</p>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
