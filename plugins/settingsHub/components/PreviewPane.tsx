/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface PreviewPaneProps {
    children: React.ReactNode;
}

export function PreviewPane({ children }: PreviewPaneProps) {
    return (
        <div className="vc-settingsHub-preview">
            <div className="vc-settingsHub-preview-label">Preview</div>
            <div className="vc-settingsHub-preview-area">
                {children}
            </div>
        </div>
    );
}
