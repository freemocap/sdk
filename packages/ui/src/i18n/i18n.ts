import {createInstance} from 'i18next';
import english from './locales/en-english.json';
const i18n = createInstance();
void i18n.init({lng:'en',fallbackLng:'en',initImmediate:false,
    resources:{en:{translation:english}},interpolation:{escapeValue:false}});
export default i18n;
