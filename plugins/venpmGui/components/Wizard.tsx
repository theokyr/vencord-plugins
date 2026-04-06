import { useState, useEffect } from "@webpack/common";
import { settings } from "../settings";
import type { EnvironmentStatus, VenpmDetection } from "../types";
import { Native } from "../nativeApi";

type WizardStep = 1 | 2 | 3 | 4;

function CheckIcon({ ok }: { ok: boolean }) {
    return <span style={{ color: ok ? "#3db249" : "#da373c", fontSize: 16 }}>{ok ? "\u2713" : "\u2717"}</span>;
}

function WarnIcon() {
    return <span style={{ color: "#faa61a", fontSize: 16 }}>!</span>;
}

function Step1({ onNext }: { onNext: () => void }) {
    return (
        <>
            <h2>Welcome to venpm</h2>
            <p>
                venpm makes it easy to discover, install, and update Vencord plugins — all from inside Discord.
            </p>
            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>
                venpm installs plugins by downloading them into Vencord's source directory.
                After installing, Vencord needs to rebuild — this takes a few seconds and may restart Discord.
            </p>
            <div className="vc-venpmGui-wizard-actions">
                <button className="vc-venpmGui-btn vc-venpmGui-btn-primary" onClick={onNext}>
                    Let's get you set up
                </button>
            </div>
        </>
    );
}

function Step2({ onNext }: { onNext: () => void }) {
    const [env, setEnv] = useState<EnvironmentStatus | null>(null);

    useEffect(() => {
        Native.detectEnvironment().then(setEnv);
    }, []);

    if (!env) {
        return <p style={{ opacity: 0.5 }}>Checking environment...</p>;
    }

    const nodeOk = !!env.node;
    const npmOk = env.npm;
    const canContinue = nodeOk && npmOk;

    return (
        <>
            <h2>Environment Check</h2>
            <p>Let's make sure your system has everything venpm needs.</p>

            <div className="vc-venpmGui-wizard-checks">
                <div className="vc-venpmGui-wizard-check">
                    <CheckIcon ok={nodeOk} />
                    <span>Node.js {nodeOk ? `v${env.node}` : "(not found)"}</span>
                </div>
                <div className="vc-venpmGui-wizard-check">
                    <CheckIcon ok={npmOk} />
                    <span>npm {npmOk ? "(available)" : "(not found)"}</span>
                </div>
                <div className="vc-venpmGui-wizard-check">
                    {env.git ? <CheckIcon ok /> : <WarnIcon />}
                    <span>git {env.git ? "(available)" : "(not found)"}</span>
                </div>
                {!env.git && (
                    <div style={{ paddingLeft: 24, fontSize: 12, opacity: 0.5 }}>
                        Recommended — without git, plugins install via tarball which is slower
                    </div>
                )}
                <div className="vc-venpmGui-wizard-check">
                    {env.pnpm ? <CheckIcon ok /> : <WarnIcon />}
                    <span>pnpm {env.pnpm ? "(available)" : "(not found)"}</span>
                </div>
                {!env.pnpm && (
                    <div style={{ paddingLeft: 24, fontSize: 12, opacity: 0.5 }}>
                        Recommended — needed for Vencord rebuilds
                    </div>
                )}
            </div>

            <div className="vc-venpmGui-wizard-actions">
                <button
                    className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                    onClick={onNext}
                    disabled={!canContinue}
                >
                    Continue
                </button>
            </div>
        </>
    );
}

function Step3({ onNext }: { onNext: () => void }) {
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [showManual, setShowManual] = useState(false);

    // Check if already installed
    useEffect(() => {
        Native.detectVenpm().then(d => {
            if (d.found) {
                setDone(true);
                setTimeout(onNext, 1500);
            }
        });
    }, []);

    const handleInstall = async () => {
        setInstalling(true);
        setError(null);
        const result = await Native.installVenpm();
        setInstalling(false);
        if (result.success) {
            setDone(true);
            setTimeout(onNext, 500);
        } else {
            setError(result.error ?? "Installation failed");
        }
    };

    return (
        <>
            <h2>Install venpm</h2>
            <p>venpm will be installed globally via npm. This is a one-time setup.</p>

            {done ? (
                <>
                    <div className="vc-venpmGui-wizard-checks">
                        <div className="vc-venpmGui-wizard-check">
                            <CheckIcon ok />
                            <span>venpm installed</span>
                        </div>
                    </div>
                    <div className="vc-venpmGui-wizard-actions">
                        <button className="vc-venpmGui-btn vc-venpmGui-btn-primary" onClick={onNext}>
                            Continue
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="vc-venpmGui-wizard-actions" style={{ justifyContent: "flex-start" }}>
                        <button
                            className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                            onClick={handleInstall}
                            disabled={installing}
                        >
                            {installing ? "Installing..." : "Install"}
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ color: "#da373c", fontSize: 13, marginBottom: 8 }}>{error}</div>
                            <button
                                className="vc-venpmGui-btn vc-venpmGui-btn-secondary"
                                onClick={handleInstall}
                            >
                                Try Again
                            </button>
                            <span
                                style={{ marginLeft: 12, fontSize: 12, opacity: 0.5, cursor: "pointer", textDecoration: "underline" }}
                                onClick={() => setShowManual(!showManual)}
                            >
                                Install Manually
                            </span>
                            {showManual && (
                                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }}>
                                    npm install -g venpm
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
}

function Step4({ onComplete }: { onComplete: () => void }) {
    const [vencordPath, setVencordPath] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Native.detectEnvironment().then(env => {
            if (env.vencordPath) setVencordPath(env.vencordPath);
        });
    }, []);

    const handleDone = async () => {
        if (vencordPath.trim()) {
            setSaving(true);
            await Native.runVenpm(["config", "set", "vencord.path", vencordPath.trim()]);
            setSaving(false);
        }
        settings.store.setupComplete = true;
        onComplete();
    };

    return (
        <>
            <h2>Configure</h2>

            <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Vencord Path</label>
                <input
                    className="vc-venpmGui-input"
                    type="text"
                    value={vencordPath}
                    onChange={e => setVencordPath(e.target.value)}
                    placeholder="/path/to/Vencord"
                    style={{ width: "100%" }}
                />
            </div>

            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>
                Default repository: kamaras-plugins (pre-configured)
            </p>

            <div className="vc-venpmGui-wizard-actions">
                <button
                    className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                    onClick={handleDone}
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Done \u2014 Start Browsing"}
                </button>
            </div>
        </>
    );
}

export function Wizard({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState<WizardStep>(1);

    return (
        <div className="vc-venpmGui-wizard-overlay">
            <div className="vc-venpmGui-wizard">
                {step === 1 && <Step1 onNext={() => setStep(2)} />}
                {step === 2 && <Step2 onNext={() => setStep(3)} />}
                {step === 3 && <Step3 onNext={() => setStep(4)} />}
                {step === 4 && <Step4 onComplete={onComplete} />}
            </div>
        </div>
    );
}
