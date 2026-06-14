"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { PatientResponse } from "@/lib/types";

export interface SavedPatient {
  id: number;
  name: string;
  email: string;
  birthDate: string;
  concern: string;
  createdAt: string;
}

interface PatientCtx {
  // FHIR demo data
  data: PatientResponse | null;
  loading: boolean;
  error: string | null;
  // Facts captured during the voice intake session (client-side only).
  voiceFacts: { question: string; response: string; tag: string }[];
  addVoiceFact: (f: { question: string; response: string; tag: string }) => void;
  // Persisted patient list
  savedPatients: SavedPatient[];
  loadingSavedPatients: boolean;
  activePatientId: number | null;
  setActivePatient: (id: number) => void;
  refreshPatients: () => Promise<void>;
}

const Ctx = createContext<PatientCtx | null>(null);

export function PatientProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PatientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceFacts, setVoiceFacts] = useState<
    { question: string; response: string; tag: string }[]
  >([]);

  // Persisted patients
  const [savedPatients, setSavedPatients] = useState<SavedPatient[]>([]);
  const [loadingSavedPatients, setLoadingSavedPatients] = useState(true);
  const [activePatientId, setActivePatientId] = useState<number | null>(null);

  // Fetch FHIR demo data
  useEffect(() => {
    let active = true;
    fetch("/api/patient")
      .then((r) => r.json())
      .then((d: PatientResponse) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch persisted patients from Neon
  const refreshPatients = useCallback(async () => {
    setLoadingSavedPatients(true);
    try {
      const res = await fetch("/api/patients");
      if (!res.ok) throw new Error("Failed to fetch patients");
      const rows: SavedPatient[] = await res.json();
      setSavedPatients(rows);
      // Auto-select the first patient if none is active yet
      setActivePatientId((prev) => {
        if (prev === null && rows.length > 0) return rows[0].id;
        // If previously selected patient was removed, reset
        const stillExists = rows.some((p) => p.id === prev);
        return stillExists ? prev : rows.length > 0 ? rows[0].id : null;
      });
    } catch (e) {
      console.error("[v0] refreshPatients error:", e);
    } finally {
      setLoadingSavedPatients(false);
    }
  }, []);

  useEffect(() => {
    refreshPatients();
  }, [refreshPatients]);

  return (
    <Ctx.Provider
      value={{
        data,
        loading,
        error,
        voiceFacts,
        addVoiceFact: (f) => setVoiceFacts((prev) => [...prev, f]),
        savedPatients,
        loadingSavedPatients,
        activePatientId,
        setActivePatient: setActivePatientId,
        refreshPatients,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePatient(): PatientCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePatient must be used within <PatientProvider>");
  return c;
}
