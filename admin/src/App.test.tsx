// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { App } from "./main";
afterEach(cleanup);
let requests: { path: string; body: any }[];
beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: any = {}) => {
      requests.push({
        path,
        body: options.body ? JSON.parse(options.body) : null,
      });
      let data: any = [];
      if (path.endsWith("/admin-login"))
        data = {
          access_token: "test-only",
          user: { username: "Operator", account_type: "admin" },
        };
      if (path.includes("/admin/summary"))
        data = {
          users: 12,
          verified_publishers: 3,
          pending_applications: 1,
          audiobooks: 9,
          open_reports: 0,
          queued_jobs: 2,
        };
      if (path.includes("/admin/attention"))
        data = { applications: 2, reports: 0, withdrawals: 0 };
      if (path.includes("/admin/applications?"))
        data = [
          {
            id: "app-1",
            legal_name: "Bengal Press",
            member: 7,
            status: "pending",
            reason: "",
            created_at: "2026-10-20T10:00:00Z",
          },
        ];
      if (path.includes("/admin/users?"))
        data = [
          {
            id: "user-1",
            serial: 3,
            username: "Reader",
            email: "reader@example.com",
            account_type: "user",
            publisher_status: "none",
            suspended: false,
          },
        ];
      return { ok: true, status: 200, json: async () => data };
    }),
  );
});
async function login() {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "example-password" },
  });
  fireEvent.click(screen.getByText("Sign in"));
  await screen.findByText("Platform health and the work waiting for review.");
}
test("dedicated login renders real returned dashboard counts", async () => {
  await login();
  await screen.findByText("12");
  expect(requests[0].path).toBe("/api/v1/auth/admin-login");
  expect(screen.getByText("12")).toBeTruthy();
});
test("people show serial member IDs; suspension is confirm-only", async () => {
  await login();
  fireEvent.click(screen.getByText("People"));
  await screen.findByText("reader@example.com");
  expect(screen.getByText("U-0003")).toBeTruthy();
  fireEvent.click(screen.getByText("Suspend"));
  expect(screen.queryByLabelText("Reason for rejection")).toBeNull();
  fireEvent.click(screen.getByText("Confirm suspend"));
  await waitFor(() =>
    expect(
      requests.some(
        (r) =>
          r.path === "/api/v1/admin/users/user-1/decision" &&
          r.body.action === "suspend" &&
          r.body.reason === undefined,
      ),
    ).toBe(true),
  );
});
test("pending applications are badged and rejection requires a reason", async () => {
  await login();
  expect(await screen.findByLabelText("2 pending")).toBeTruthy();
  fireEvent.click(screen.getByText("Publisher verification"));
  await screen.findByText("Bengal Press");
  fireEvent.click(screen.getByText("Reject"));
  fireEvent.change(screen.getByLabelText("Reason for rejection"), {
    target: { value: "Document is unreadable" },
  });
  fireEvent.click(screen.getByText("Confirm reject"));
  await waitFor(() =>
    expect(
      requests.some(
        (r) =>
          r.path === "/api/v1/admin/applications/app-1/decision" &&
          r.body.action === "reject" &&
          r.body.reason === "Document is unreadable",
      ),
    ).toBe(true),
  );
});
test("failed login stays on sign-in and shows server feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Incorrect credentials" }),
    })),
  );
  render(<App />);
  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "wrong@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByText("Sign in"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen.queryByText("Platform health and the work waiting for review."),
  ).toBeNull();
});
