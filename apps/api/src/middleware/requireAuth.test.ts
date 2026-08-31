import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireOwnClub, requireSuperadmin, type SessionUser } from "./requireAuth.js";

/**
 * These guards encode design doc §7's access rules — including the
 * deliberate choice to 404 rather than 403 a non-superadmin, so the
 * admin panel's existence isn't confirmed to someone not cleared for it.
 * That reads like a bug to anyone who doesn't know the reasoning, so
 * it's pinned here.
 */

const SECY: SessionUser = { id: "u1", role: "CLUB_SECY", clubId: "club-a" };
const ADMIN: SessionUser = { id: "u2", role: "SUPERADMIN", clubId: null };

function mockReq(user?: SessionUser, params: Record<string, string> = {}, body: unknown = {}) {
  return { user, params, body } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    ended: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

describe("requireAuth", () => {
  it("passes a signed-in user through", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireAuth(mockReq(SECY), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("401s an anonymous request and does not call next", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireAuth(mockReq(undefined), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("requireSuperadmin", () => {
  it("passes a superadmin through", () => {
    const next = vi.fn() as NextFunction;
    requireSuperadmin(mockReq(ADMIN), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("404s a club secretary — not 403 — so the panel isn't confirmed to exist (§7)", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireSuperadmin(mockReq(SECY), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toBeUndefined(); // .end(), no error body to leak
  });

  it("404s an anonymous request too", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireSuperadmin(mockReq(undefined), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });
});

describe("requireOwnClub", () => {
  it("allows a secretary acting on their own club", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireOwnClub()(mockReq(SECY, { clubId: "club-a" }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("403s a secretary reaching into another club", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireOwnClub()(mockReq(SECY, { clubId: "club-b" }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("lets a superadmin bypass ownership entirely", () => {
    const next = vi.fn() as NextFunction;
    requireOwnClub()(mockReq(ADMIN, { clubId: "club-b" }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("401s an anonymous request", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireOwnClub()(mockReq(undefined, { clubId: "club-a" }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("honours a custom param name", () => {
    const next = vi.fn() as NextFunction;
    requireOwnClub("id")(mockReq(SECY, { id: "club-a" }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("falls back to the request body when the route carries no param", () => {
    const next = vi.fn() as NextFunction;
    requireOwnClub()(mockReq(SECY, {}, { clubId: "club-a" }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("403s when neither param nor body names a club, rather than failing open", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireOwnClub()(mockReq(SECY, {}, {}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
