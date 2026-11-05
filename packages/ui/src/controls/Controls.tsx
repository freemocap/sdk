import {useId, type ReactNode} from 'react';
import SubactionHeader from '../components/ui-components/SubactionHeader';

export interface NumberFieldProps {
    label: string;
    value: string | number;
    onChange: (value: string) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    description?: string;
}

/** Uses the shared Core input container and theme; validation policy stays with the app. */
export function NumberField({label, value, onChange, min, max, step = 1, disabled, description}: NumberFieldProps) {
    const id = useId();
    return <div className="sdk-number-field">
        <label className="text md" htmlFor={id}>{label}</label>
        <div className="input-with-unit sdk-number-container">
            <input id={id} className="input-field numeric-input text md" type="number" value={value}
                min={min} max={max} step={step} disabled={disabled}
                aria-describedby={description ? `${id}-description` : undefined}
                onChange={event => onChange(event.target.value)} />
        </div>
        {description && <small id={`${id}-description`} className="sdk-control-description">{description}</small>}
    </div>;
}

export interface ControlSectionProps {
    title: string;
    children: ReactNode;
    description?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
}
export function ControlSection({title, children, description, collapsible = false, defaultOpen = false}: ControlSectionProps) {
    const content = <div className="sdk-control-content">
        {description && <p className="sdk-control-description">{description}</p>}{children}
    </div>;
    return collapsible
        ? <details className="sdk-control-section" open={defaultOpen || undefined}>
            <summary className="sdk-control-summary">{title}</summary>{content}
        </details>
        : <section className="sdk-control-section" aria-label={title}><SubactionHeader text={title}/>{content}</section>;
}

export interface LegendItem {label: string; color: string; description?: string}
export interface LegendProps {label: string; items: readonly LegendItem[]; note?: string; details?: ReactNode}
/** Colors describe app-supplied scene layers; labels carry meaning independently of color. */
export function Legend({label, items, note, details}: LegendProps) {
    return <section className="sdk-legend" aria-label={label}>
        <span className="sdk-legend-title">{label}</span>
        <ul className="sdk-legend-items">{items.map(item => <li key={item.label} title={item.description}>
            <span aria-hidden="true" className="sdk-legend-swatch" style={{backgroundColor:item.color}}/>
            <span>{item.label}</span>
        </li>)}</ul>
        {note && <span className="sdk-legend-note">{note}</span>}
        {details && <details className="sdk-legend-details"><summary>Details</summary><div>{details}</div></details>}
    </section>;
}
