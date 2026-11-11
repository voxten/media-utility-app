// Design foundations as the app uses them: surfaces, text colours, accents, type scale, radii and elevation.
// Useful to compare themes side by side before changing app/theme.ts.

import type { ComponentType, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Body1,
  Body1Strong,
  Caption1,
  Caption2,
  LargeTitle,
  makeStyles,
  Subtitle1,
  Subtitle2,
  Title1,
  Title2,
  Title3,
  tokens,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { CATEGORIES, CATEGORY_ACCENTS, SETTINGS_ACCENT } from "../app/tools";

const useStyles = makeStyles({
  section: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "32px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" },
  swatch: { display: "flex", flexDirection: "column", gap: "6px" },
  chip: {
    height: "56px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  name: { color: tokens.colorNeutralForeground3 },
  typeRow: { display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", alignItems: "baseline", gap: "16px" },
  box: {
    height: "72px",
    display: "grid",
    placeItems: "center",
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
});

const SURFACES = [
  "colorNeutralBackground1",
  "colorNeutralBackground2",
  "colorNeutralBackground3",
  "colorNeutralBackground4",
  "colorSubtleBackgroundHover",
  "colorNeutralStroke1",
  "colorNeutralStroke2",
  "colorNeutralStroke3",
] as const;

const FOREGROUNDS = [
  "colorNeutralForeground1",
  "colorNeutralForeground2",
  "colorNeutralForeground3",
  "colorNeutralForeground4",
  "colorBrandForeground1",
  "colorBrandBackground",
  "colorPaletteRedForeground1",
  "colorPaletteGreenForeground1",
] as const;

const TYPE_RAMP: [string, ComponentType<{ children: ReactNode }>][] = [
  ["LargeTitle", LargeTitle],
  ["Title1", Title1],
  ["Title2", Title2],
  ["Title3", Title3],
  ["Subtitle1", Subtitle1],
  ["Subtitle2", Subtitle2],
  ["Body1Strong", Body1Strong],
  ["Body1", Body1],
  ["Caption1", Caption1],
  ["Caption2", Caption2],
];

const RADII = ["borderRadiusSmall", "borderRadiusMedium", "borderRadiusLarge", "borderRadiusXLarge"] as const;
const SHADOWS = ["shadow2", "shadow4", "shadow8", "shadow16", "shadow28", "shadow64"] as const;

function Swatch({ name, color }: { name: string; color: string }) {
  const styles = useStyles();
  return (
    <div className={styles.swatch}>
      <div className={styles.chip} style={{ backgroundColor: color }} />
      <Caption1 className={styles.name}>{name}</Caption1>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      <Subtitle1>{title}</Subtitle1>
      {children}
    </section>
  );
}

function Colors() {
  const styles = useStyles();
  return (
    <>
      <Section title="Surfaces & strokes">
        <div className={styles.grid}>
          {SURFACES.map((name) => (
            <Swatch key={name} name={name} color={tokens[name]} />
          ))}
        </div>
      </Section>
      <Section title="Text & brand">
        <div className={styles.grid}>
          {FOREGROUNDS.map((name) => (
            <Swatch key={name} name={name} color={tokens[name]} />
          ))}
        </div>
      </Section>
      <Section title="Category accents (app/tools.tsx)">
        <div className={styles.grid}>
          {CATEGORIES.map((id) => (
            <Swatch key={id} name={`${id} ${CATEGORY_ACCENTS[id]}`} color={CATEGORY_ACCENTS[id]} />
          ))}
          <Swatch name={`settings ${SETTINGS_ACCENT}`} color={SETTINGS_ACCENT} />
        </div>
      </Section>
    </>
  );
}

function Typography() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Section title="Type ramp">
      {TYPE_RAMP.map(([name, Text]) => (
        <div key={name} className={styles.typeRow}>
          <Caption1 className={styles.name}>{name}</Caption1>
          <Text>{t("tools.download.description")}</Text>
        </div>
      ))}
    </Section>
  );
}

function Shape() {
  const styles = useStyles();
  return (
    <>
      <Section title="Corner radius">
        <div className={styles.grid}>
          {RADII.map((name) => (
            <div key={name} className={styles.box} style={{ borderRadius: tokens[name] }}>
              <Caption1 className={styles.name}>{name}</Caption1>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Elevation">
        <div className={styles.grid}>
          {SHADOWS.map((name) => (
            <div key={name} className={styles.box} style={{ boxShadow: tokens[name], borderRadius: tokens.borderRadiusLarge }}>
              <Caption1 className={styles.name}>{name}</Caption1>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

const meta = {
  title: "Foundations/Tokens",
  tags: ["!autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ColorTokens: Story = { render: () => <Colors /> };

export const TypeRamp: Story = { render: () => <Typography /> };

export const RadiusAndElevation: Story = { render: () => <Shape /> };
