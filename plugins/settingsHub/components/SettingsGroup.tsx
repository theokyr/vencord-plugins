/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import type { Group, SettingConfig } from "../schema";
import { ToggleSetting } from "./controls/ToggleSetting";
import { SliderSetting } from "./controls/SliderSetting";
import { SelectSetting } from "./controls/SelectSetting";
import { ColorSetting } from "./controls/ColorSetting";
import { TriStateToggle } from "./controls/TriStateToggle";
import { KeybindRecorder } from "./controls/KeybindRecorder";
import { TextSetting } from "./controls/TextSetting";
import { ComponentSetting } from "./controls/ComponentSetting";

interface SettingsGroupProps {
    group: Group;
    settings: DefinedSettings;
    pluginName: string;
}

export function SettingsGroup({ group, settings, pluginName }: SettingsGroupProps) {
    return (
        <div>
            {group.label && (
                <div className="vc-settingsHub-group-label">{group.label}</div>
            )}
            {group.settings.map(config => (
                <SettingControl
                    key={config.key}
                    config={config}
                    settings={settings}
                    pluginName={pluginName}
                />
            ))}
        </div>
    );
}

function SettingControl({ config, settings, pluginName }: {
    config: SettingConfig;
    settings: DefinedSettings;
    pluginName: string;
}) {
    if (!settings?.def) return null;
    const optDef = (settings.def as any)[config.key] as any;
    if (!optDef) return null;

    const label = config.label ?? optDef.description ?? config.key;
    const description = config.description ?? undefined;
    const anchorId = `settings-${pluginName}-${config.key}`;

    const controlType = config.control ?? autoDetectControl(optDef.type);
    if (!controlType) return null;

    switch (controlType) {
        case "toggle":
            return <ToggleSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} />;

        case "slider": {
            const s = config.slider ?? { min: 0, max: 100 };
            return <SliderSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} min={s.min} max={s.max} step={s.step} unit={s.unit} markers={s.markers} />;
        }

        case "select":
            return <SelectSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} options={optDef.options ?? []} />;

        case "color":
            return <ColorSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} />;

        case "tristate":
            return <TriStateToggle settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} denyLabel={config.tristate?.deny} promptLabel={config.tristate?.prompt} allowLabel={config.tristate?.allow} />;

        case "keybind":
            return <KeybindRecorder settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} />;

        case "text":
            return <TextSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} />;

        case "component":
            return <ComponentSetting settingKey={config.key} settings={settings} label={label} description={description} anchorId={anchorId} />;

        default:
            return null;
    }
}

function autoDetectControl(optionType: OptionType): string | null {
    switch (optionType) {
        case OptionType.BOOLEAN: return "toggle";
        case OptionType.NUMBER: return "slider";
        case OptionType.STRING: return "text";
        case OptionType.SELECT: return "select";
        case OptionType.SLIDER: return "slider";
        case OptionType.COMPONENT: return "component";
        default: return null;
    }
}
