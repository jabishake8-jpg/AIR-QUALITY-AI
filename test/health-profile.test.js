import test from "node:test";
import assert from "node:assert/strict";
import { deriveAgeFromProfile, deriveProfileFromAge } from "../js/health-profile.js";

test("age-derived health profile matches child and older adult thresholds", () => {
  assert.equal(deriveProfileFromAge(0), "child");
  assert.equal(deriveProfileFromAge(12), "child");
  assert.equal(deriveProfileFromAge(18), "general");
  assert.equal(deriveProfileFromAge(40), "general");
  assert.equal(deriveProfileFromAge(64), "general");
  assert.equal(deriveProfileFromAge(65), "elderly");
  assert.equal(deriveProfileFromAge(90), "elderly");
});

test("profile-derived age defaults stay aligned with the health profile labels", () => {
  assert.equal(deriveAgeFromProfile("child"), 12);
  assert.equal(deriveAgeFromProfile("general"), 35);
  assert.equal(deriveAgeFromProfile("elderly"), 70);
  assert.equal(deriveAgeFromProfile("asthma"), 42);
  assert.equal(deriveAgeFromProfile("outdoor_worker"), 38);
  assert.equal(deriveAgeFromProfile("unknown"), 35);
});
