import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NumberField,ControlSection,Legend} from './Controls';
import {SidebarProcessingAction} from './SidebarProcessingAction';
import {RunActivity} from '../workspace/Workspace';

test('shared explanations are behind named help controls while factual controls remain visible',()=>{
    const explanation='Static explanation must stay in help';
    const views=[
        h(NumberField,{label:'Frames',value:30,onChange:()=>{},description:explanation}),
        h(ControlSection,{title:'Prepare recording',description:explanation,children:'Actual run state'}),
        h(ControlSection,{title:'Prepare recording',description:explanation,collapsible:true,children:'Actual run state'}),
        h(Legend,{label:'Scene layers',items:[{label:'Predictions',color:'#30a7ad'}],note:explanation,details:'More static detail'}),
        h(SidebarProcessingAction,{text:'Prepare',onClick:()=>{},description:explanation}),
    ];
    for(const view of views){
        const html=renderToStaticMarkup(view);
        assert.doesNotMatch(html,/Static explanation must stay in help|More static detail/);
        assert.match(html,/explainer-icon/);
        assert.match(html,/aria-label=/);
    }
    assert.match(renderToStaticMarkup(views[0]),/value="30"/);
    assert.match(renderToStaticMarkup(views[1]),/Actual run state/);
    assert.match(renderToStaticMarkup(views[3]),/Predictions/);
});

test('stale activity keeps the actual update age visible and recovery advice in help',()=>{
    const html=renderToStaticMarkup(h(RunActivity,{stage:'Training',active:true,elapsedSeconds:90,updateAgeSeconds:31}));
    assert.match(html,/No update for/);assert.match(html,/31/);assert.match(html,/data-stale="true"/);
    assert.match(html,/aria-label="Run update status"/);
    assert.doesNotMatch(html,/Check the connection|check connection and logs/);
});
