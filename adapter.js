var _ = require('underscore');
var parley = require('parley');

var config = require('./config.js');

// Extend adapter definition
var Adapter = module.exports = function (adapter) {
	// Assign logger (using console.log as default)
	adapter.log = adapter.config.log || console.log;

	// Absorb configuration
	this.config = adapter.config || {};


	this.initialize = function(cb) {
		var self = this;

		// When process ends, close all open connections
		process.on('SIGINT', process.exit);
		process.on('SIGTERM', process.exit);
		process.on('exit', function () { self.teardown(); });

		// Set scheme based on `persistent` options
		this.config.scheme = this.config.persistent ? 'alter' : 'drop';

		adapter.initialize ? adapter.initialize(cb) : cb();
	};

	this.teardown = function (cb) {
		adapter.teardown ? adapter.teardown(cb) : (cb && cb());
	};



	//////////////////////////////////////////////////////////////////////
	// DDL
	//////////////////////////////////////////////////////////////////////
	this.define = function(collectionName, definition, cb) { 

		// If id is not defined, add it
		// TODO: Make this check for ANY primary key
		// TODO: Make this disableable in the config
		if (!definition.attributes.id) {
			definition.attributes.id = {
				type: 'INTEGER',
				primaryKey: true,
				autoIncrement: true
			};
		}

		// If the config allows it, and they aren't already specified,
		// extend definition with updatedAt and createdAt
		if(config.createdAt && !definition.createdAt) definition.createdAt = 'DATE';
		if(config.updatedAt && !definition.updatedAt) definition.updatedAt = 'DATE';

		// Convert string-defined attributes into fully defined objects
		for (var attr in definition.attributes) {
			if(_.isString(definition[attr])) {
				definition[attr] = {
					type: definition[attr]
				};
			}
		}

		// Grab schema from definition
		var schema = definition.attributes;

		// Verify that collection doesn't already exist
		// and then define it and trigger callback
		this.describe(collectionName,function (err,existingSchema) {
			if (err) return cb(err,schema);
			else if (existingSchema) return cb("Trying to define a collection ("+collectionName+") which already exists with schema:",existingSchema);
			else return ( adapter.define ? adapter.define(collectionName,schema,cb) : cb() );
		});
	};

	this.describe = function(collectionName, cb) { 
		adapter.describe ? adapter.describe(collectionName,cb) : cb();
	};
	this.drop = function(collectionName, cb) { 
		// TODO: foreach through and delete all of the models for this collection
		adapter.drop ? adapter.drop(collectionName,cb) : cb();
	};
	this.alter = function (collectionName,newAttrs,cb) { 
		adapter.alter ? adapter.alter(collectionName,newAttrs,cb) : cb();
	};


	//////////////////////////////////////////////////////////////////////
	// DQL
	//////////////////////////////////////////////////////////////////////
	this.create = function(collectionName, values, cb) {
		adapter.create ? adapter.create(collectionName,values,cb) : cb();
	};
	this.find = function(collectionName, options, cb) {
		options = normalizeCriteria(options);
		adapter.find ? adapter.find(collectionName,options,cb) : cb();
	};
	this.update = function(collectionName, criteria, values, cb) {
		criteria = normalizeCriteria(criteria);
		adapter.update ? adapter.update(collectionName,criteria,values,cb) : cb();
	};
	this.destroy = function(collectionName, criteria, cb) {
		criteria = normalizeCriteria(criteria);
		adapter.destroy ? adapter.destroy(collectionName,criteria,cb) : cb();
	};

	//////////////////////////////////////////////////////////////////////
	// Convenience methods (overwritable in adapters)
	//////////////////////////////////////////////////////////////////////
	this.findOrCreate = function (collectionName, criteria, values, cb) { 
		criteria = normalizeCriteria(criteria);
		if (adapter.findOrCreate) adapter.findOrCreate(collectionName, criteria, values, cb);
		else throw "TODO! :: This functionality will be released in an upcoming version.";
	};
	this.findAndUpdate = function (collectionName, criteria, values, cb) { 
		criteria = normalizeCriteria(criteria);
		if (adapter.findAndUpdate) adapter.findAndUpdate(collectionName, criteria, values, cb);
		else this.update(collectionName, criteria, values, cb);
	};
	this.findAndDestroy = function (collectionName, criteria, cb) { 
		criteria = normalizeCriteria(criteria);
		if (adapter.findAndDestroy) adapter.findAndDestroy(collectionName, criteria, cb);
		else this.destroy(collectionName, criteria, cb);
	};




	// Begin an atomic transaction
	// lock models in collection which fit criteria (if criteria is null, lock all)
	this.lock = function (collectionName, criteria, cb) { 

		// **************************************
		// NAIVE SOLUTION
		// (only the first roommate to notice gets the milk; the rest wait as soon as they see the note)

		// No need to check the fridge!  Just start writing your note.

		// TODO: Generate identifier for this transaction (use collection name to start with, but better yet, boil down criteria to essentials to allow for more concurrent access)
		// TODO: Create entry in transaction DB (If you're sure that no other notes exist on fridge, write a note)
		// TODO: Check the transaction db (CHECK THE DAMN FRIDGE IN CASE ONE OF YOUR ROOMMATES WROTE THE NOTE WHILE YOU WERE BUSY)

		// TODO: If > 1 entry exists in the transaction db, subscribe to mutex queue and wait (if you see a note already on the fridge, get in line to be notified when roommate gets home)
		// TODO: Otherwise, trigger callback!	QA immediately (you're good to go get the milk)

		// **************************************
		// AGRESSIVE SOLUTION
		// (all roommates try to go get the milk, but the first person to get the milk prevents others from putting it in the fridge)

		// TODO: Ask locksmith for model clone
		// TODO: Pass model clone in callback

		adapter.lock ? adapter.lock(collectionName,criteria,cb) : cb();
	};

	// Commit and end an atomic transaction
	// unlock models in collection which fit criteria (if criteria is null, unlock all)
	this.unlock = function (collectionName, criteria, cb) { 

		// **************************************
		// NAIVE SOLUTION
		// (only the first roommate to notice gets the milk; the rest wait as soon as they see the note)

		// TODO: Remove entry from transaction db (Remove your note from fridge)
		// TODO: Callback can be triggered immediately, since you're sure the note will be removed

		adapter.unlock ? adapter.unlock(collectionName,criteria,cb) : cb();
	};

	this.status = function (collectionName, cb) {
		adapter.status ? adapter.status(collectionName,cb) : cb();
	};

	this.autoIncrement = function (collectionName, values,cb) {
		adapter.autoIncrement ? adapter.autoIncrement(collectionName, values, cb) : cb();
	};

	// If @collectionName and @otherCollectionName are both using this adapter, do a more efficient remote join.
	// (By default, an inner join, but right and left outer joins are also supported.)
	this.join = function(collectionName, otherCollectionName, key, foreignKey, left, right, cb) {
		adapter.join ? adapter.join(collectionName, otherCollectionName, key, foreignKey, left, right, cb) : cb();
	};

	// Sync given collection's schema with the underlying data model
	// Scheme can be 'drop' or 'alter'
	// Controls whether database is dropped and recreated when app starts,
	// or whether waterline will try and synchronize the schema with the app models.
	this.sync = {

		// Drop and recreate collection
		drop: function(collection,cb) {
			var self = this;
			this.drop(collection.identity,function (err,data) {
				self.define(collection.identity,collection,cb);
			});
		},
		
		// Alter schema
		alter: function(collection, cb) {
			var self = this;

			// Check that collection exists-- if it doesn't go ahead and add it and get out
			this.describe(collection.identity,function (err,data) {
				if (err) throw err;
				else if (!data) return self.define(collection.identity,collection,cb);
			});

			// Iterate through each attribute on each model in your app
			_.each(collection.attributes, function checkAttribute(attribute) {
				// and make sure that a comparable field exists in the data store
				// TODO
			});

			// Check that the attribute exists in the data store
			// TODO

			// If not, alter the collection to include it
			// TODO

			// Iterate through each attribute in this collection
			// and make sure that a comparable field exists in the model
			// TODO

			// If not, alter the collection and remove it
			// TODO
			cb();	
		}
	};

	// Bind adapter methods to self
	_.bindAll(adapter);
	_.bindAll(this);
	_.bind(this.sync.drop,this);
	_.bind(this.sync.alter,this);

	// Mark as valid adapter
	this._isWaterlineAdapter = true;
};


/**
 * Run a method on an object -OR- each item in an array and return the result
 * Also handle errors gracefully
 */
function plural (collection, application) {
	if(_.isArray(collection)) {
		return _.map(collection, application);
	} else if(_.isObject(collection)) {
		return application(collection);
	} else {
		throw "Invalid collection passed to plural aggreagator:" + collection;
	}
}

// Normalize the different ways of specifying criteria into a uniform object
function normalizeCriteria (criteria) {
	// Empty undefined values from criteria object
	_.each(criteria,function(val,key) {
		if (val === undefined) delete criteria[key];
	});

	if((_.isFinite(criteria) || _.isString(criteria)) && +criteria > 0) {
		criteria = {
			id: +criteria
		};
	}
	if(!_.isObject(criteria)) {
		throw 'Invalid criteria, ' + criteria + ' in find()';
	}
	if (!criteria.where && !criteria.limit && 
		!criteria.skip && !criteria.offset && 
		!criteria.order) {
		console.log("CRITERIAAAAAA",criteria);
		criteria = { where: criteria };
		console.log("CRITERIAAAAAA2222",criteria);
	}

	// If any item in criteria is a parsable finite number, use that
	for (var attrName in criteria.where) {
		if (Math.pow(+criteria.where[attrName],2) > 0) {
			criteria.where[attrName] = +criteria.where[attrName];
		}
	}

	return criteria;
}