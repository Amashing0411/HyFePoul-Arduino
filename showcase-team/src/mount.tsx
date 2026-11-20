import * as React from "react";
import { createRoot } from "react-dom/client";
import TeamLanyardRail from "@/components/ui/team-lanyard-rail";
import type { LanyardMember } from "@/components/ui/team-lanyard-rail";

/** Lets the page bring one person forward (the presenter's arrow keys step through the team). */
export type TeamApi = { show: (index: number | null) => void; active: () => number | null; count: number };

function Rail({ items, api }: { items: LanyardMember[]; api: TeamApi }) {
  const [active, setActive] = React.useState<number | null>(null);
  const ref = React.useRef(active);
  ref.current = active;
  api.show = (index) => setActive(index);
  api.active = () => ref.current;
  return (
    <TeamLanyardRail
      items={items}
      active={active}
      onActiveChange={setActive}
      heading="The team behind HyFePoul"
      caption="Move along the rail to meet someone, pull a badge down, or click it to flip."
    />
  );
}

export function mount(element: HTMLElement, items: LanyardMember[]): TeamApi {
  const api: TeamApi = { show: () => {}, active: () => null, count: items.length };
  createRoot(element).render(<Rail items={items} api={api} />);
  return api;
}
