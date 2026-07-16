import { useMemo } from "react";
import PalIcon from "./PalIcon";
import PassiveChips from "./PassiveChipList";
import { pals } from "../lib/data";
import type {
  OwnedInstance,
  PlanRef,
  PlanResult,
  PlanStep,
} from "../lib/passivePathfinder";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;

interface Props {
  plan: PlanResult;
  owned: OwnedInstance[];
  desired: string[];
}

type TreeNode =
  | { kind: "step"; step: PlanStep; index: number; parents: TreeNode[] }
  | { kind: "source"; pal: number; mask: number; instance: OwnedInstance }
  | { kind: "reuse"; pal: number; stepIndex: number };

function buildTree(plan: PlanResult, owned: OwnedInstance[]): TreeNode | null {
  if (plan.steps.length === 0) return null;
  const seen = new Set<number>();

  const build = (ref: PlanRef): TreeNode => {
    if (ref.type === "source") {
      const src = plan.sources[ref.index];
      return {
        kind: "source",
        pal: src.pal,
        mask: src.mask,
        instance: owned[src.instance],
      };
    }
    if (seen.has(ref.index)) {
      return {
        kind: "reuse",
        pal: plan.steps[ref.index].child,
        stepIndex: ref.index,
      };
    }
    seen.add(ref.index);
    const step = plan.steps[ref.index];
    return {
      kind: "step",
      step,
      index: ref.index,
      parents: [build(step.p1Ref), build(step.p2Ref)],
    };
  };

  return build({ type: "step", index: plan.steps.length - 1 });
}

function Chips({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="tcard-chips">
      <PassiveChips ids={ids} />
    </div>
  );
}

function Node({ node, desired }: { node: TreeNode; desired: string[] }) {
  const maskIds = (mask: number) => desired.filter((_, k) => mask & (1 << k));

  if (node.kind === "reuse") {
    return (
      <div className="tcard tcard-reuse">
        ♻ <PalIcon pal={node.pal} size={20} /> {pals[node.pal].fr}
        <span className="tcard-sub">déjà élevé (étape {node.stepIndex + 1})</span>
      </div>
    );
  }

  if (node.kind === "source") {
    const inst = node.instance;
    return (
      <div className="tcard tcard-source">
        <div className="tcard-title">
          <PalIcon pal={node.pal} size={30} />
          {pals[node.pal].fr}
          {inst.gender ? ` ${genderSymbol[inst.gender]}` : ""}
        </div>
        <span className="tcard-sub">
          {inst.nickname ? `« ${inst.nickname} » — ` : ""}
          {inst.level ? `niv. ${inst.level}` : "possédé"}
          {inst.ivs
            ? ` · IV ${inst.ivs.hp}/${inst.ivs.attack}/${inst.ivs.defense}`
            : ""}
        </span>
        <Chips ids={maskIds(node.mask)} />
      </div>
    );
  }

  const s = node.step;
  return (
    <div className="tnode">
      <div className="tcard tcard-step">
        <div className="tcard-title">
          <span className="step-no">{node.index + 1}</span>
          <PalIcon pal={s.child} size={30} />
          {pals[s.child].fr}
          {s.childGender ? ` ${genderSymbol[s.childGender]}` : ""}
        </div>
        <Chips ids={maskIds(s.childMask)} />
        <span className="tcard-sub">
          ~{s.eggs < 10 ? s.eggs.toFixed(1) : Math.round(s.eggs)} œufs
          {s.genderFactor > 1.01 ? " (genre inclus)" : ""}
          {" · "}
          {s.p1Gender ? genderSymbol[s.p1Gender] : "?"} ×{" "}
          {s.p2Gender ? genderSymbol[s.p2Gender] : "?"}
          {s.condition ? " (combo genré)" : ""}
        </span>
      </div>
      <div className="tchildren">
        {node.parents.map((p, k) => (
          <div key={k} className="tbranch">
            <Node node={p} desired={desired} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlanTree({ plan, owned, desired }: Props) {
  const tree = useMemo(() => buildTree(plan, owned), [plan, owned]);
  if (!tree) return null;
  return (
    <div className="tree-scroll">
      <div className="tree-root">
        <Node node={tree} desired={desired} />
      </div>
    </div>
  );
}
