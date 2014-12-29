var Lab = require("lab"), server = require("../");

Lab.experiment("Items", function() {
    Lab.test("inserts an item without data", function(done) {
        var options = {
            method: "POST",
            url: "/create/"
        };
     
        server.inject(options, function(response) {
            var result = response.result;
     
            Lab.expect(response.statusCode).to.equal(400);
            done();
        });
    });
    
    Lab.test("inserts an item with data", function(done) {
        var options = {
            method: "POST",
            url: "/create/?data=https://www.youtube.com/watch?v=nxQO53J2_OQ&title='pwediepiie'"
        };
     
        server.inject(options, function(response) {
            var result = response.result;
     
            Lab.expect(response.statusCode).to.equal(201);
            Lab.expect(result).to.be.instanceof(Array);
     
            done();
        });
    });
});
