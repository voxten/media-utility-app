import type { Announcements, DndContextProps, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

type Accessibility = NonNullable<DndContextProps["accessibility"]>;

export function sortableAccessibility(
  t: TFunction,
  ids: readonly UniqueIdentifier[],
  label: (id: UniqueIdentifier) => string,
): Accessibility {
  const total = ids.length;
  const at = (id: UniqueIdentifier) => ids.indexOf(id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("common.sortable.pickedUp", { name: label(active.id), position: at(active.id), total }),
    onDragOver: ({ active, over }) =>
      over
        ? t("common.sortable.moved", { name: label(active.id), position: at(over.id), total })
        : t("common.sortable.outside", { name: label(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("common.sortable.dropped", { name: label(active.id), position: at(over.id), total })
        : t("common.sortable.cancelled", { name: label(active.id) }),
    onDragCancel: ({ active }) => t("common.sortable.cancelled", { name: label(active.id) }),
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: t("common.sortable.instructions") };
  return { announcements, screenReaderInstructions };
}

export function useSortableAccessibility(
  ids: readonly UniqueIdentifier[],
  label: (id: UniqueIdentifier) => string,
): Accessibility {
  const { t } = useTranslation();
  return sortableAccessibility(t, ids, label);
}
