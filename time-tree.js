"use strict";
var time_tree;
time_tree = (function () {
    var dataset, binData, binLength, nodes, values, minTime, maxTime,
        childAccessor, startTimeAccessor, durationAccessor, nameAccessor,
        childDurationInBin, durationInBin, traverse;

    var dimArray = function (n, initialValue) {
        var a = [],
            cloneObject = function cloneObject(obj) {
                var source = obj.constructor();
                Object.getOwnPropertyNames(obj).forEach(function (key) {
                    source[key] = cloneObject(obj[key]);
                });
                return source;
            };

        while (n > 0) {
            a[n - 1] = cloneObject(initialValue);
            n -= 1;
        }
        return a;
    };
    
    var getDuration = function (d) {
        var st = startTimeAccessor(d);
        var et = (st + durationAccessor(d));
        return et - st;
    };

    var removeChildDurationFromNodeDuration = function (node, initialDuration) {
        var duration = initialDuration, i = 0;
        if (node.Children !== undefined && node.Children.length > 0) {
            while (i < node.Children.length) {
                duration = duration - getDuration(node.Children[i]);
                i += 1;
            }
        }

        return duration;
    };

    var valueVisitor = function (ds) {
        var st = new Date(startTimeAccessor(ds)).getTime();
        var et = (st + durationAccessor(ds));

        ds.st = st;
        ds.et = et;
        ds.duration = removeChildDurationFromNodeDuration(ds, ds.et - ds.st);

        nodes += 1;

        values.push({ st: st, et: et, duration: ds.duration });

        return time_tree;
    };

    var binVisitor = function (node, opts) {
        var i = 0, currentBin, nextBin, st, et, msInBin;
        while (i  < opts.bins.length) {
            currentBin = opts.bins[i];
            nextBin = opts.bins[i + 1];

            st = currentBin.t;
            et = nextBin === undefined ? maxTime : nextBin.t;
            currentBin.duration = et - currentBin.t;

            msInBin = durationInBin(node, st, et, currentBin.duration);
            if (msInBin > 0) {
                if (currentBin.bins[nameAccessor(node)] === undefined) {
                    currentBin.bins[nameAccessor(node)] = msInBin;
                } else {
                    currentBin.bins[nameAccessor(node)] += msInBin;
                }
            }

            i += 1;
        }
    };

    var setMinMax = function (values) {
        var i = 0;
        while (i < values.length) {
            if (minTime > values[i].st) {
                minTime = values[i].st;
            }
            if (maxTime < values[i].et) {
                maxTime = values[i].et;
            }
            i += 1;
        }
    };
    
    var msToArray = function (st, et) {
        var retv = [];
        while (st < et) {
            retv.push(st);
            st = st + 1;
        }
        return retv;
    };

    var getBinTimes = function (source, binCount) {
        var res = dimArray(binCount + 1, { t: 0, bins: {} }),
            step = Math.floor(source.length / binCount),
            i = 0,
            c = 0;

        while (i < binCount) {
            res[i].t = source[c];
            c += step;
            i += 1;
        }
        res[binCount].t = maxTime;
        return res;
    };

    var countBins = function (ds) {
        var n = ds.length - 1;
        return (Math.ceil(Math.log(n) / Math.log(2) + 1) * 1) + 1; // +1: max time
    };

    var parse = function () {
        binLength = 0;
        nodes = 0;
        values = [];
        minTime = Number.MAX_VALUE;
        maxTime = 0;
        binData = [];

        traverse(valueVisitor, dataset);
        setMinMax(values);

        var msArray = msToArray(minTime, maxTime);
        binLength = countBins(msArray);
        var bins = getBinTimes(msArray, binLength);
        traverse(binVisitor, dataset, { bins: bins });

        return bins;
    };
        
    var renderable = function (ds) {
        var i = 0;
        ds.forEach(function (d) {
            var yoffset = 0, binTotal = 0;
            d.rects = dimArray(0, 0);

            Object.getOwnPropertyNames(d.bins).forEach(function (binName) {
                binTotal += d.bins[binName];
            });

            Object.getOwnPropertyNames(d.bins).forEach(function (binName) {
                var bin = d.bins[binName],
                    percentage = (bin / binTotal) * 100,
                    rect = {
                        name: binName,
                        p: percentage,
                        x: i,
                        y: yoffset
                    };

                yoffset = percentage + yoffset;
                d.rects.push(rect);
            });

            i += 1;
        });

        return ds;
    };

    traverse = function (visitorFunc, node, opts) {
        var index, child;

        visitorFunc(node, opts);

        Object.getOwnPropertyNames(childAccessor(node)).forEach(function (accessor) {
            index = parseInt(accessor, 10);
            if (!isNaN(index)) {
                child = childAccessor(node)[index];
                if (child !== undefined) {
                    traverse(visitorFunc, child, opts);
                }
            }
        });

        return time_tree;
    };

    childDurationInBin = function (node, st, et, binDuration) {
        if (node.Children === undefined) {
            return 0;
        }

        var childDuration = 0, j = 0;
        while (j < node.Children.length) {
            childDuration += durationInBin(node.Children[j], st, et, binDuration);
            j += 1;
        }
        return childDuration;
    };

    durationInBin = function (node, st, et, binDuration) {
        // if event starts after bin or ends before bin
        if (node.st > et || node.et < st) {
            return 0;
        }

        // if event starts before and ends after,
        // return value is the entire bin duration - (children duration in bin)
        if (node.st <= st && node.et >= et) {
            return binDuration - childDurationInBin(node, st, et, binDuration);
        }

        // if event starts during and ends after,
        // return value is the (bin et - node st) - (children duration in bin)
        if (node.st >= st && node.et >= et) {
            return et - node.st - childDurationInBin(node, st, et, binDuration);
        }

        // if event starts before and ends during,
        // return value is (node et - bin st) - (children duration in bin)
        if (node.st <= st && node.et <= et) {
            return node.et - st - childDurationInBin(node, st, et, binDuration);
        }

        // if event starts during and ends during
        // return value is node duration
        if (node.st >= st && node.et <= et) {
            return node.duration - childDurationInBin(node, st, et, binDuration);
        }

        throw "missing condition";
    };

    childAccessor = function (d) {
        return d.children;
    };

    startTimeAccessor = function (d) {
        return d.start;
    };

    durationAccessor = function (d) {
        return d.duration;
    };

    nameAccessor = function (d) {
        return d.name;
    }

    return {
        /* sets the data set to be rendered. */
        data: function (ds) {
            dataset = ds;
            binData = [];
            return time_tree;
        },
        /* sets the function to be called which gets the children of the current */
        children: function (func) {
            childAccessor = func;
            return time_tree;
        },
        startTime: function(func) { 
            startTimeAccessor = func;
            return time_tree;
        },
        /* sets the function to be called which gets the millisecond duration of the event */
        duration: function (func) { 
            durationAccessor = func;
            return time_tree;
        },
        name: function (func) { 
            nameAccessor = func;
            return time_tree;
        },
        nodes: function () {
            if (binData.length === 0) {
                binData = parse();
            }
            binData = renderable(binData);
            return binData;
        },
        length: function () {
            if (binData.length === 0) {
                binData = parse();
            }
            return binLength;
        }
    };
}());

