import { redirect } from "next/navigation";

/** /duels on its own has no list: duels live in the Arena. */
export default function DuelsIndex() {
  redirect("/arena");
}
