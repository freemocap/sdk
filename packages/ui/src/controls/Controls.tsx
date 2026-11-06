import {useId, type ReactNode} from 'react';
import SubactionHeader from '../components/ui-components/SubactionHeader';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';

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
        <div className="flex items-center gap-1"><label className="text md" htmlFor={id}>{label}</label>
            {description && <AnchoredInfo title={label} text={description}/>}</div>
        <div className="input-with-unit sdk-number-container">
            <input id={id} className="input-field numeric-input text md" type="number" value={value}
                min={min} max={max} step={step} disabled={disabled}
                onChange={event => onChange(event.target.value)} />
        </div>
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
        {children}
    </div>;
    return collapsible
        ? <details className="sdk-control-section" open={defaultOpen || undefined}>
            <summary className="sdk-control-summary">{title}</summary>
            {description && <AnchoredInfo title={title} text={description}/>} {content}
        </details>
        : <section className="sdk-control-section" aria-label={title}><div className="flex items-center gap-1"><SubactionHeader text={title}/>
            {description && <AnchoredInfo title={title} text={description}/>}</div>{content}</section>;
}

export interface LegendItem {label: string; color: string; description?: string}
export interface LegendProps {label: string; items: readonly LegendItem[]; note?: string; details?: ReactNode}
/** Colors describe app-supplied scene layers; labels carry meaning independently of color. */
export function Legend({label, items, note, details}: LegendProps) {
    return <section className="sdk-legend" aria-label={label}>
        <div className="flex items-center gap-1"><span className="sdk-legend-title">{label}</span>
            {(note || details) && <AnchoredInfo title={label} text={<>{note && <p>{note}</p>}{details}</>}/>}</div>
        <ul className="sdk-legend-items">{items.map(item => <li key={item.label} title={item.description}>
            <span aria-hidden="true" className="sdk-legend-swatch" style={{backgroundColor:item.color}}/>
            <span>{item.label}</span>
        </li>)}</ul>
    </section>;
}
