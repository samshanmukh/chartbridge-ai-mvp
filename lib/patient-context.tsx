"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PatientResponse } from "@/lib/types";

interface PatientCtx {
  data: PatientResponse | null;
  loading: boolean;
  error: string | null;
  // Facts captured during the voice intake session (client-side only).
  voiceFacts: { question: string; response: string; tag: string }[];
  addVoiceFact: (f: { question: string; response: string; tag: string }) => void;
}

const Ctx = createContext<PatientCtx | null>(null);

export function PatientProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PatientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceFacts, setVoiceFacts] = useState<
    { question: string; response: string; tag: string }[]
  >([]);

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

  return (
    <Ctx.Provider
      value={{
        data,
        loading,
        error,
        voiceFacts,
        addVoiceFact: (f) => setVoiceFacts((prev) => [...prev, f]),
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
