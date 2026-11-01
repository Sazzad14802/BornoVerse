/**
 * Moderation: content reports dashboard, report case view with independent
 * actions, appeals queue and account moderation records.
 */
import React, { useEffect, useState } from "react";
import { fileUrl, request } from "./api";
import { Icon, Modal, Row, dateTime, memberId } from "./ui";

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

async function openFile(path: string, setError: (m: string) => void) {
  try {
    window.open(await fileUrl(path), "_blank", "noopener");
  } catch (e) {
    setError((e as Error).message);
  }
}

// ── Reports dashboard ───────────────────────────────────────────────────────

export function ReportsPage({
  listen,
  onChanged,
}: {
  listen: (id: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      setRows(await request(`/admin/reports?status=${status}`));
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
            <option value="open">Open (pending and under review)</option>
            <option value="action_taken">Action taken</option>
            <option value="appealed">Appealed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="">All reports</option>
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
                      <button onClick={() => setOpen(r.id)}>Open</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

export function AppealsPage({
  listen,
  onChanged,
}: {
  listen: (id: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await request(`/admin/appeals?status=${status}`));
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
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="">All appeals</option>
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
                      <button onClick={() => setOpen(a.report_id)}>
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

type Pane = null | "actions" | "dismiss" | "confirm" | "accept" | "reject";

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
                className="secondary"
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
                {data.reporter_dismissed_reports > 0 && (
                  <span className="subtle">
                    {" "}
                    · {data.reporter_dismissed_reports} earlier report(s)
                    dismissed
                  </span>
                )}
              </dd>
              <dt>Content owner</dt>
              <dd>{who(data.owner)}</dd>
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
                <ul className="files">
                  {data.evidence.map((f: Row) => (
                    <li key={f.id}>
                      <button
                        className="link"
                        onClick={() =>
                          openFile(
                            `/admin/moderation/evidence/${f.id}`,
                            setError,
                          )
                        }
                      >
                        <Icon name="document" size={14} />
                        {f.filename}
                      </button>
                    </li>
                  ))}
                </ul>
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
              {appeal.evidence.length > 0 && (
                <ul className="files">
                  {appeal.evidence.map((f: Row) => (
                    <li key={f.id}>
                      <button
                        className="link"
                        onClick={() =>
                          openFile(
                            `/admin/moderation/evidence/${f.id}`,
                            setError,
                          )
                        }
                      >
                        <Icon name="document" size={14} />
                        {f.filename}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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

        <aside className="case-side">
          {record && (
            <RecordSummary
              record={record}
              onChanged={load}
              setError={setError}
            />
          )}

          <section className="case-section">
            <h4>Decision</h4>
            <div className="stack">
              {data.status === "pending" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => send(`/admin/reports/${id}/review`, {})}
                >
                  Start review
                </button>
              )}
              {(open || data.status === "action_taken") && (
                <button disabled={busy} onClick={() => setPane("actions")}>
                  Take action
                </button>
              )}
              {open && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPane("dismiss")}
                >
                  Dismiss report
                </button>
              )}
              {(open || data.status === "action_taken") && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPane("confirm")}
                >
                  Confirm violation
                </button>
              )}
              {data.status === "action_taken" && windowClosed && (
                <p className="subtle">
                  The appeal window has closed. The case can be finalised.
                </p>
              )}
              {appeal?.status === "pending" && (
                <>
                  <button disabled={busy} onClick={() => setPane("accept")}>
                    Accept appeal
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => setPane("reject")}
                  >
                    Reject appeal
                  </button>
                </>
              )}
              {!open && !["action_taken", "appealed"].includes(data.status) && (
                <p className="subtle">This case is closed.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

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
    </Modal>
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
