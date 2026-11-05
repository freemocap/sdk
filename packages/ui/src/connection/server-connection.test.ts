import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ConnectionState} from '@freemocap/client';
import {ServerConnectionStatus,connectionPresentation} from './ServerConnectionStatus';

test('only open WebSocket state displays connected even when HTTP is available',()=>{
    const markup=renderToStaticMarkup(createElement(ServerConnectionStatus,{
        state:ConnectionState.DISCONNECTED,endpoint:'http://127.0.0.1:8000',httpStatus:'available',processId:42,
    }));
    assert.match(markup,/Not connected/);
    assert.doesNotMatch(markup,/>Connected</);
    assert.equal(connectionPresentation(ConnectionState.CONNECTED).text,'Connected');
    assert.equal(connectionPresentation(ConnectionState.RECONNECTING).text,'Reconnecting…');
    assert.equal(connectionPresentation(ConnectionState.FAILED).text,'Connection failed');
});
