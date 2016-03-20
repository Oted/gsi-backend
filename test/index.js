const Code  = require('code');
const Lab   = require('lab');
const lab   = exports.lab = Lab.script();

const describe  = lab.describe;
const it        = lab.it;
const before    = lab.before;
const after     = lab.after;
const expect    = Code.expect;

const Utils     = require('../lib/utils');

describe('utils', () => {

    before((done) => {
        done();
    });

    after((done) => {
        done();
    });

    it('returns id of youtube 1', (done) => {
        const obj = {
            'data' : 'https://www.youtube.com/watch?v=Hl0DD_MYqZU'
        };

        Utils.peelYoutubeId(obj);

        expect(obj.data).to.equal('Hl0DD_MYqZU');
        done();
    });

    it('returns id of youtube 2', (done) => {
        const obj = {
            'data' : 'https://www.youtube.com/watch?feature=player_embedded&amp;v=xG-meaGqg-M'
        };

        Utils.peelYoutubeId(obj);

        expect(obj.data).to.equal('xG-meaGqg-M');
        done();
    });

    it('returns id of youtube 3', (done) => {
        const obj = {
            'data' : 'https://www.youtube.com/watch?feature=youtu.be&amp;v=flBVV6dEaas&amp;app=desktop'
        };

        Utils.peelYoutubeId(obj);

        expect(obj.data).to.equal('flBVV6dEaas');
        done();
    });
});
