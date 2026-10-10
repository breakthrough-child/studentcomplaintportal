import { redirect } from "next/navigation";

// /main-lecturer on its own used to be a 404. Redirect only: it reveals nothing, and the destination is guarded by
// this area's layout (requireRole) like every other page here.
export default function Page() {
  redirect("/main-lecturer/dashboard");
}
