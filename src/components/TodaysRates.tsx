"use client";

import { useState } from "react";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useLang } from "@/lib/i18n/client";
import { formatDate } from "@/lib/format";
import type { FuelRate } from "@/lib/database.types";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, CardHeader, NumberInput } from "@/components/ui";
import { DisclosureContext } from "@/components/Disclosure";
import { setTodaysRate } from "@/app/(app)/rates/actions";

/**
 * The rate is the first thing the pump sets each morning and the number every
 * other figure is built on, so it belongs on the screen everyone opens — not
 * four taps down inside Settings.
 */
export function TodaysRates({
  rates,
  titled = true,
}: {
  rates: FuelRate[];
  /** false where the page's own header already names it */
  titled?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState<string | null>(null);

  const stale = rates.filter((r) => !r.set_today);
  const nameOf = (r: FuelRate) =>
    lang === "gu" && r.name_gu ? r.name_gu : r.name;

  return (
    <Card>
      {/* On the rates page the page header already says this; saying it again
          three lines below, with the same warning under it, is the screen
          repeating itself. */}
      {titled ? (
        <CardHeader
          title={t("rate.today")}
          subtitle={
            stale.length === 0 ? t("rate.allSetToday") : t("rate.staleWarning")
          }
        />
      ) : null}

      <div className="flex flex-col divide-y divide-divider">
        {rates.map((r) => (
          <div key={r.fuel_type_id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: r.color }}
                />
                <span className="font-semibold">{nameOf(r)}</span>
                {r.set_today ? (
                  <Check
                    className="size-4 text-accent-2-700"
                    aria-label={t("rate.setToday")}
                  />
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] text-accent-800">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    {r.effective_from
                      ? `${t("rate.since")} ${formatDate(r.effective_from)}`
                      : t("rate.neverSet")}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="tabular font-[family-name:var(--font-heading)] text-[22px] leading-none">
                  {r.sale_rate != null
                    ? `₹${Number(r.sale_rate).toFixed(2)}`
                    : "—"}
                  <span className="ml-1 text-[13px] text-neutral-600">
                    /{r.unit}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditing(
                      editing === r.fuel_type_id ? null : r.fuel_type_id,
                    )
                  }
                  aria-label={`${t("set.newRate")} — ${r.name}`}
                  aria-expanded={editing === r.fuel_type_id}
                  className="cursor-pointer rounded-full p-2 text-neutral-600 transition hover:bg-accent-100 hover:text-accent"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {editing === r.fuel_type_id ? (
              <div className="mt-3">
                <DisclosureContext.Provider value={() => setEditing(null)}>
                  <ActionForm
                    action={setTodaysRate}
                    className="flex flex-wrap items-center gap-2"
                    onDone={t("counter.done")}
                  >
                    <input
                      type="hidden"
                      name="fuel_type_id"
                      value={r.fuel_type_id}
                    />
                    <NumberInput
                      name="sale_rate"
                      step="0.001"
                      required
                      autoFocus
                      defaultValue={r.sale_rate ?? ""}
                      aria-label={`${t("rate.today")} — ${r.name}`}
                      className="max-w-[9rem]"
                    />
                    <SubmitButton size="sm">{t("common.save")}</SubmitButton>
                    <span className="text-[12px] text-neutral-600">
                      {t("rate.appendOnly")}
                    </span>
                  </ActionForm>
                </DisclosureContext.Provider>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
