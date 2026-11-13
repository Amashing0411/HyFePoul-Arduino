import { createRoot } from "react-dom/client";
import TeamLanyardRail from "@/components/ui/team-lanyard-rail";
import type { LanyardMember } from "@/components/ui/team-lanyard-rail";

export function mount(element: HTMLElement, items: LanyardMember[]) {
  createRoot(element).render(
    <TeamLanyardRail
      items={items}
      heading="The team behind HyFePoul"
      caption="Move along the rail to meet someone, pull a badge down, or click it to flip."
    />,
  );
}
