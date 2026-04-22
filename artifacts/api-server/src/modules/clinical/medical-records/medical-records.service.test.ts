import { describe, it, expect } from "vitest";
import { buildIndicators } from "./medical-records.service.js";

const d = (iso: string) => new Date(iso);

describe("buildIndicators", () => {
  it("retorna estrutura vazia quando não há dados", () => {
    const result = buildIndicators([], [], [], []);
    expect(result).toEqual({
      eva: [],
      body: null,
      reab: null,
      bodyMeasurements: [],
    });
  });

  it("agrega EVA de anamnese, avaliação e evolução ordenando por data", () => {
    const result = buildIndicators(
      [
        {
          templateType: "reabilitacao",
          painScale: 7,
          updatedAt: d("2026-03-01T10:00:00Z"),
          bodyWeight: null,
          bodyHeight: null,
          bodyMeasurements: null,
          celluliteGrade: null,
          cid10: "M54.5",
          painLocation: "lombar",
          functionalImpact: "alto",
        },
      ],
      [{ painScale: 5, createdAt: d("2026-03-15T10:00:00Z") }],
      [
        { painScale: 4, createdAt: d("2026-04-01T10:00:00Z") },
        { painScale: null, createdAt: d("2026-04-05T10:00:00Z") },
      ],
      [],
    );

    expect(result.eva).toHaveLength(3);
    expect(result.eva.map((p) => p.value)).toEqual([7, 5, 4]);
    expect(result.eva.map((p) => p.source)).toEqual([
      "anamnesis",
      "evaluation",
      "evolution",
    ]);
    expect(result.eva[0].label).toContain("Reabilitação");
  });

  it("ignora pontos com painScale null", () => {
    const result = buildIndicators(
      [],
      [{ painScale: null, createdAt: d("2026-04-01T00:00:00Z") }],
      [{ painScale: null, createdAt: d("2026-04-02T00:00:00Z") }],
      [],
    );
    expect(result.eva).toEqual([]);
  });

  it("extrai bodyIndicators apenas da anamnese estética corporal", () => {
    const result = buildIndicators(
      [
        {
          templateType: "esteticaCorporal",
          painScale: null,
          updatedAt: d("2026-04-10T00:00:00Z"),
          bodyWeight: "65.5",
          bodyHeight: "168",
          bodyMeasurements: "torax: 90",
          celluliteGrade: "II",
          cid10: null,
          painLocation: null,
          functionalImpact: null,
        },
      ],
      [],
      [],
      [],
    );
    expect(result.body).toEqual({
      weight: "65.5",
      height: "168",
      measurements: "torax: 90",
      celluliteGrade: "II",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    expect(result.reab).toBeNull();
  });

  it("extrai reabIndicators da anamnese de reabilitação", () => {
    const result = buildIndicators(
      [
        {
          templateType: "reabilitacao",
          painScale: 3,
          updatedAt: d("2026-04-12T00:00:00Z"),
          bodyWeight: null,
          bodyHeight: null,
          bodyMeasurements: null,
          celluliteGrade: null,
          cid10: "M54",
          painLocation: "cervical",
          functionalImpact: "moderado",
        },
      ],
      [],
      [],
      [],
    );
    expect(result.reab).toEqual({
      cid10: "M54",
      painLocation: "cervical",
      functionalImpact: "moderado",
      updatedAt: "2026-04-12T00:00:00.000Z",
    });
  });

  it("converte série de medidas corporais em números", () => {
    const result = buildIndicators(
      [],
      [],
      [],
      [
        {
          id: 1,
          measuredAt: d("2026-04-01T00:00:00Z"),
          weight: "70.5",
          height: "175",
          waist: "80",
          abdomen: "85",
          hips: "95",
          thighRight: "55",
          thighLeft: "55",
          armRight: "30",
          armLeft: "30",
          calfRight: "35",
          calfLeft: "35",
          bodyFat: "22.5",
          celluliteGrade: "I",
          notes: "ok",
        },
      ],
    );
    expect(result.bodyMeasurements).toHaveLength(1);
    expect(result.bodyMeasurements[0]).toMatchObject({
      id: 1,
      date: "2026-04-01T00:00:00.000Z",
      weight: 70.5,
      height: 175,
      bodyFat: 22.5,
      celluliteGrade: "I",
      notes: "ok",
    });
  });
});
