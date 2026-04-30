import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  getTopRiskyPackages,
  getOwnerAnomalySummary,
  getSeverityDistribution,
  getMethodBreakdown,
} from "./anomaly-repository.js";

function buildTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE packages (
      id TEXT PRIMARY KEY, package_name TEXT, owner_name TEXT, owner_type TEXT,
      satker TEXT, budget REAL, procurement_method TEXT, procurement_type TEXT,
      selection_date TEXT, potential_waste REAL DEFAULT 0, severity TEXT,
      reason TEXT, risk_score REAL, is_mencurigakan INTEGER, is_pemborosan INTEGER,
      is_priority INTEGER DEFAULT 0, is_flagged INTEGER DEFAULT 0,
      active_tag_count INTEGER DEFAULT 0, mapped_region_count INTEGER DEFAULT 0,
      inserted_order INTEGER
    );
    CREATE TABLE owner_metrics (
      owner_type TEXT, owner_name TEXT,
      total_packages INTEGER DEFAULT 0, total_priority_packages INTEGER DEFAULT 0,
      total_flagged_packages INTEGER DEFAULT 0, total_potential_waste REAL DEFAULT 0,
      total_budget REAL DEFAULT 0, med_severity_packages INTEGER DEFAULT 0,
      high_severity_packages INTEGER DEFAULT 0, absurd_severity_packages INTEGER DEFAULT 0,
      PRIMARY KEY (owner_type, owner_name)
    );
  `);

  const insertPkg = db.prepare(`
    INSERT INTO packages
      (id, package_name, owner_name, owner_type, budget,
       procurement_method, risk_score, severity, potential_waste,
       is_mencurigakan, is_pemborosan, is_priority, is_flagged, inserted_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOwner = db.prepare(`
    INSERT INTO owner_metrics
      (owner_type, owner_name, total_packages, total_priority_packages,
       total_flagged_packages, total_potential_waste, total_budget,
       med_severity_packages, high_severity_packages, absurd_severity_packages)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertPkg.run("PKT-001", "Pengadaan Server",  "Dinas A", "kabkota",  500_000_000, "Penunjukan Langsung", 0.85, "absurd", 200_000_000, 1, 1, 1, 1, 1);
    insertPkg.run("PKT-002", "Renovasi Gedung",   "Dinas A", "kabkota",  200_000_000, "Tender",             0.40, "med",     50_000_000,  0, 1, 0, 0, 2);
    insertPkg.run("PKT-003", "Pengadaan ATK",     "Dinas A", "kabkota",   10_000_000, "Tender",             0.10, "low",      1_000_000,  0, 0, 0, 0, 3);
    insertPkg.run("PKT-004", "Konsultansi Hukum", "Dinas B", "provinsi", 300_000_000, "Penunjukan Langsung", 0.70, "high",   80_000_000,  1, 0, 1, 1, 4);
    insertOwner.run("kabkota",  "Dinas A", 3, 1, 1, 251_000_000, 710_000_000, 1, 0, 1);
    insertOwner.run("provinsi", "Dinas B", 1, 1, 1,  80_000_000, 300_000_000, 0, 1, 0);
  })();

  return db;
}

let db;
before(() => { db = buildTestDb(); });

describe("getTopRiskyPackages", () => {
  test("sorted by risk_score DESC", () => {
    const { data } = getTopRiskyPackages(db, { limit: 10 });
    assert.ok(data.length > 0);
    for (let i = 1; i < data.length; i++)
      assert.ok(data[i-1].audit.riskScore >= data[i].audit.riskScore);
  });
  test("filter ownerType=kabkota", () => {
    const { data } = getTopRiskyPackages(db, { ownerType: "kabkota" });
    assert.ok(data.every(p => p.ownerType === "kabkota"));
  });
  test("filter severity=absurd", () => {
    const { data } = getTopRiskyPackages(db, { severity: "absurd" });
    assert.ok(data.every(p => p.audit.severity === "absurd"));
  });
  test("filter mencurigakan=1", () => {
    const { data } = getTopRiskyPackages(db, { mencurigakan: "1" });
    assert.ok(data.every(p => p.audit.isMencurigakan === true));
  });
  test("filter pemborosan=1", () => {
    const { data } = getTopRiskyPackages(db, { pemborosan: "1" });
    assert.ok(data.every(p => p.audit.isPemborosan === true));
  });
  test("respects limit", () => {
    const { data } = getTopRiskyPackages(db, { limit: 1 });
    assert.equal(data.length, 1);
  });
  test("caps limit at 200", () => {
    const { data } = getTopRiskyPackages(db, { limit: 99999 });
    assert.ok(data.length <= 4);
  });
  test("invalid ownerType ignored", () => {
    const { data } = getTopRiskyPackages(db, { ownerType: "INVALID" });
    assert.ok(data.length > 0);
  });
  test("result shape", () => {
    const { data } = getTopRiskyPackages(db, { limit: 1 });
    const p = data[0];
    assert.ok("id" in p && "packageName" in p && "audit" in p && "meta" in p);
    assert.ok("riskScore" in p.audit && "severity" in p.audit);
  });
});

describe("getOwnerAnomalySummary", () => {
  test("returns summary + topPackages", () => {
    const r = getOwnerAnomalySummary(db, "kabkota", "Dinas A");
    assert.ok(r !== null && "summary" in r && "topPackages" in r);
  });
  test("mencurigakan and pemborosan counts", () => {
    const { summary } = getOwnerAnomalySummary(db, "kabkota", "Dinas A");
    assert.equal(summary.totalMencurigakan, 1);
    assert.equal(summary.totalPemborosan,   2);
  });
  test("avgRiskScore and maxRiskScore are numbers", () => {
    const { summary } = getOwnerAnomalySummary(db, "kabkota", "Dinas A");
    assert.equal(typeof summary.avgRiskScore, "number");
    assert.equal(typeof summary.maxRiskScore, "number");
    assert.ok(summary.maxRiskScore >= summary.avgRiskScore);
  });
  test("topPackages sorted DESC", () => {
    const { topPackages } = getOwnerAnomalySummary(db, "kabkota", "Dinas A");
    for (let i = 1; i < topPackages.length; i++)
      assert.ok(topPackages[i-1].audit.riskScore >= topPackages[i].audit.riskScore);
  });
  test("null for unknown owner", () => {
    assert.equal(getOwnerAnomalySummary(db, "kabkota", "Tidak Ada"), null);
  });
  test("null for invalid ownerType", () => {
    assert.equal(getOwnerAnomalySummary(db, "INVALID", "Dinas A"), null);
  });
});

describe("getSeverityDistribution", () => {
  test("returns non-empty array", () => {
    const { data } = getSeverityDistribution(db);
    assert.ok(Array.isArray(data) && data.length > 0);
  });
  test("each entry has required fields", () => {
    for (const e of getSeverityDistribution(db).data)
      assert.ok("severity" in e && "totalPackages" in e && "totalPotentialWaste" in e && "avgRiskScore" in e);
  });
  test("covers seeded severity levels", () => {
    const levels = getSeverityDistribution(db).data.map(d => d.severity);
    assert.ok(levels.includes("absurd") && levels.includes("med") && levels.includes("low"));
  });
});

describe("getMethodBreakdown", () => {
  test("returns 2+ methods nationally", () => {
    assert.ok(getMethodBreakdown(db).data.length >= 2);
  });
  test("each entry has required fields", () => {
    for (const e of getMethodBreakdown(db).data)
      assert.ok("procurementMethod" in e && "totalPackages" in e && "totalMencurigakan" in e && "avgRiskScore" in e);
  });
  test("scoped to Dinas A = 3 packages", () => {
    const { data } = getMethodBreakdown(db, { ownerType: "kabkota", ownerName: "Dinas A" });
    assert.equal(data.reduce((s, d) => s + d.totalPackages, 0), 3);
  });
  test("penunjukan langsung has mencurigakan", () => {
    const pl = getMethodBreakdown(db).data.find(d => /penunjukan/i.test(d.procurementMethod));
    assert.ok(pl && pl.totalMencurigakan > 0);
  });
});
