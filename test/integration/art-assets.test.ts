import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PaintingExhibit, RoomContent } from "../../src/types";

const ART_DIR = join(__dirname, "../../public/art");
const CONTENT_DIR = join(__dirname, "../../content");

const MIN_FILE_SIZE_BYTES = 20_000; // a real painting reproduction is never this small

/**
 * Regression test for a real incident: the original painting downloads used
 * a URL that silently redirected to a 696MB master image, and a 30s curl
 * timeout truncated the download mid-stream. Every tool in the pipeline
 * (sips, ffmpeg, PIL) decoded the truncated JPEG "successfully" — valid
 * header, correct reported dimensions — and silently gray-filled the
 * scanlines past the truncation point. The bug was invisible at every
 * build step and only showed up as a flat gray rectangle in the running
 * app. This test can't fully re-verify JPEG scan-line integrity without a
 * decoder, but a file-size floor catches the exact failure mode observed:
 * a truncated JPEG's file size is far smaller than a real photo at the
 * same pixel dimensions.
 */
describe("public/art assets", () => {
  const files = readdirSync(ART_DIR).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"));

  it("found the expected painting image files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: is not suspiciously small (truncated-download regression)`, () => {
      const size = statSync(join(ART_DIR, file)).size;
      expect(size, `${file} is ${size} bytes — looks truncated, not a real photo`).toBeGreaterThan(
        MIN_FILE_SIZE_BYTES,
      );
    });

    it(`${file}: has a valid JPEG magic number and an End-Of-Image marker`, () => {
      const bytes = readFileSync(join(ART_DIR, file));
      expect(bytes[0], `${file}: JPEG SOI marker`).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      // A truncated JPEG stream is missing its trailing EOI marker (FF D9).
      const lastTwo = [bytes[bytes.length - 2], bytes[bytes.length - 1]];
      expect(lastTwo, `${file}: missing JPEG EOI marker — file is truncated`).toEqual([0xff, 0xd9]);
    });
  }

  it("every painting exhibit's imageUrl resolves to a file in public/art (except deliberately-broken fixtures)", () => {
    const roomFiles = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json") && !f.includes("manifest"));
    for (const roomFile of roomFiles) {
      const content = JSON.parse(readFileSync(join(CONTENT_DIR, roomFile), "utf-8")) as RoomContent;
      for (const exhibit of content.exhibits) {
        if (exhibit.kind !== "painting") continue;
        const painting = exhibit as PaintingExhibit;
        if (painting.imageUrl.includes("does-not-exist")) continue; // intentional 404 fixture
        const filename = painting.imageUrl.replace(/^\/art\//, "");
        expect(files, `${roomFile}'s "${painting.id}" references missing art asset ${painting.imageUrl}`).toContain(
          filename,
        );
      }
    }
  });
});
