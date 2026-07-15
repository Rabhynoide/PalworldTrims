/**
 * Web Worker du planificateur : exécute findPassivePlan hors du fil
 * principal et remonte la progression.
 */

import {
  findPassivePlan,
  type OwnedInstance,
  type PlanResult,
} from "./passivePathfinder";

export interface PlanRequest {
  owned: OwnedInstance[];
  target: number;
  desired: string[];
  /** Passifs souhaités pouvant être ajoutés via la table d'opération. */
  surgeryAllowed?: string[];
}

export type PlanWorkerMessage =
  | { type: "progress"; sweep: number; fraction: number }
  | { type: "done"; plan: PlanResult | null };

const post = (msg: PlanWorkerMessage) =>
  (self as { postMessage(m: unknown): void }).postMessage(msg);

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const { owned, target, desired, surgeryAllowed } = e.data;
  let lastPost = 0;
  const plan = findPassivePlan(
    owned,
    target,
    desired,
    (sweep, fraction) => {
      const now = Date.now();
      if (now - lastPost >= 40) {
        lastPost = now;
        post({ type: "progress", sweep, fraction });
      }
    },
    surgeryAllowed
  );
  post({ type: "done", plan });
};
