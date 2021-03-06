(function()
{
	if(typeof console == 'undefined')
	{
		console = { };
	}
	if(typeof console.log != 'function')
	{
		console.log = $.noop;
	}

	var api = APPDOTNET;

	// Standard one coming
	var vendorNamespace = 'net.app.mattflaschen.chess';

	jQuery.support.cors = true;

	function getToken()
	{
		var token, match = window.location.hash.match(/access_token=([^&]*)/);
		if(match)
		{
			token = match[1];
 			if(token)
			{
				return token;
			}
		}

		token = $.cookie('token');
		return token;
	}

	var boardCounter = 0;

	function renderGamePost($boardControlHolder, posterUsername, html, pgn)
	{
		$boardControlHolder.addClass('gamePost');
		var $boardHolder = $('<div />');
		$boardHolder.prop('id', 'board' + (boardCounter++));

		var beginning =
		{
			'class': 'icon-backward',
			title: 'Beginning',
			handler: function()
			{
				board.transitionTo(0);
				updateAnnotation();
			}
		};

		var previous =
		{
			'class': 'icon-step-backward',
			title: 'Previous',
			handler: function()
			{
				board.transitionBackward();
				updateAnnotation();
			}
		};

		var forward =
		{
			'class': 'icon-step-forward',
			title: 'Next',
			handler: function()
			{
				board.transitionForward();
				updateAnnotation();
			}
		};

		var $annotation = $('<p />', {'class': 'annotation'});
		function updateAnnotation()
		{
			$annotation.text(board.annotation());
		};

		function gotoEnd()
		{
			board.transitionTo(board.game.transitions.length);
			updateAnnotation();
		}

		var end =
		{
			'class': 'icon-forward',
			title: 'End',
			handler: gotoEnd
		};

		var flip =
		{
			'class': 'icon-resize-vertical',
			title: 'Flip',
			handler: function()
			{
				board.flipBoard();
			}
		};

		var controlSpecs = [beginning, previous, forward, end, flip];

		var controls = $.map(controlSpecs, function(spec)
		{
			var icon = $('<i />', {'class': spec['class']});
			var handler = spec.handler;
			return $('<a />', {href: '#', 'class': 'btn', title: spec.title}).append(icon).click(function(e)
			{
				handler();
				e.preventDefault();
			});
		});
		var $controlHolder = $('<div />', {'class': 'controls'}).append(controls);

		var $poster = $('<span />', {'class': 'poster'});
		var $posterLink = $('<a />', {href: 'http://appeio.com/' + posterUsername, text: '@' + posterUsername + ':'});
		$poster.append($posterLink);

		var $msg = $('<p/>', {html: html});
		$('span[itemprop=hashtag]', $msg).each(function()
		{
			var $this = $(this);
			var hashtag = $this.data('hashtag-name');
			$this.html($('<a />', {href: 'http://appeio.com/?tag=' + hashtag, text: $this.text()}));
		});

		$('span[itemprop=mention]', $msg).each(function()
		{
			var $this = $(this);
			var mention = $this.data('mention-name');
			$this.html($('<a />', {href: 'http://appeio.com/' + mention, text: $this.text()}));
		});

		var $pgn = $('<p/>', {'class': 'pgn', text: pgn});

		$boardControlHolder.html('').append($boardHolder, $controlHolder, $annotation, $pgn, $poster, $msg, $('<hr />'));
		var board = $boardHolder.chess({pgn: pgn});
		gotoEnd();
	}

	$(function()
	{
		$('#throbber').ajaxStart(function()
		{
			$(this).show();
		}).ajaxStop(function()
		{
			$(this).hide();
		});

		var token = getToken();
		if(!token)
		{
			var $connectLink = $('#connectContainer a');
			var connectUrl = 'https://alpha.app.net/oauth/authenticate?client_id=gpLxdRy8kwJEmdhHmfD3nfr6CJzXZWe6&response_type=token&redirect_uri=' +
				window.location.protocol + '//' + window.location.host + '&scope=stream%20write_post%20follow%20messages';
			$connectLink.attr('href', connectUrl);
			$('#connectContainer').removeClass('hide');

			return;
		}

		$('body').removeClass('unauthorized').addClass('authorized');
		$.cookie('token', token);

		var authenticatedUsername, authenticatedName;

		api.init(
		{
			access_token: token,
			debug: true,
			no_globals: true
		});

		api.users().done(function(env)
		{
			authenticatedUsername = env.data.username;
			authenticatedName = env.data.name;
		});

		// https://github.com/appdotnet/api-spec/issues/154, please
		function fetchPosts(postsFetched, callback, isMore, minId)
		{
			if(postsFetched < 2000 && isMore)
			{
				api.stream({include_annotations: 1, include_directed_posts: 1, count: 200, before_id: minId}).done(function(env)
				{
					console.log(env);
					postsFetched += env.data.length;
					for(var i = 0; i < env.data.length; i++)
					{
						for(var j = 0; j < env.data[i].annotations.length; j++)
						{
							if(env.data[i].annotations[j].type == vendorNamespace)
							{
								callback(env.data[i], env.data[i].annotations[j]);
							}
						}
					}
					fetchPosts(postsFetched, callback, env.meta.more, env.meta.min_id);
				});
			}
		}

		var $holder = $('#gamesFromStream');

		fetchPosts(0, function(post, annotation)
		{
			var $post = $('<div/>');
			$holder.append($post);
			try
			{
				renderGamePost($post, post.user.username, post.html, annotation.value.pgn);
			}
			catch(e)
			{
				console.log('Error rendering game from stream: ');
				console.log(e);
				// We add then remove on error because board must be in the DOM when board is rendered due to internal jchess quirk.
				$post.remove();
			}
		}, true);

		$('.modal').on('show', function()
		{
			$(':input', this).val('');
		});

		$('#postGameModal').on('show', function()
		{
			$('#postModalBoard').html('');
		});


		var $postModalError = $('#postModalError');
		$('#previewGameBtn').click(function()
		{
			$postModalError.hide().text('');
			try
			{
				renderGamePost($('#postModalBoard'), authenticatedUsername, $('#postModalMsg').val(), $('#postModalPgn').val());
			}
			catch(e)
			{
				console.log('Error rendering entered PGN: ');
				console.log(e);
				$postModalError.text('We were unable to display the game from your PGN.  Please try again.').show();
			}
		});

		$('#postGameBtn').click(function()
		{
			var btn = this;
			$(btn).button('loading');
			api.posts($('#postModalMsg').val(), null, true, [
			    {
				    type: vendorNamespace,
				    value:
				    {
				        is_active: $('#postModalBeingPlayed').is(':checked'),
					pgn: $('#postModalPgn').val()
				    }
			    }
			]).always(function()
			{
				$(btn).button('reset');

			});
		});
	});
})();