# frozen_string_literal: true

module Studio
  class BoardsController < BaseController
    before_action :find_project_by_project_id
    before_action -> { authorize('boards', action_name) }

    def index
      boards = @project.boards.preload(last_message: :author).map do |board|
        last = board.last_message
        {
          id: board.id,
          name: board.name,
          description: board.description,
          topics_count: board.topics_count,
          messages_count: board.messages_count,
          last_message: last && {
            id: last.id,
            subject: last.subject,
            author: last.author&.name,
            updated_on: last.updated_on
          }
        }
      end
      render json: { boards: boards }
    end

    def show
      board = @project.boards.find(params[:id])
      topics = board.topics.preload(:author).reorder(sticky: :desc, updated_on: :desc).limit(100)
      render json: {
        board: { id: board.id, name: board.name, description: board.description },
        topics: topics.map do |t|
          {
            id: t.id,
            subject: t.subject,
            author: t.author&.name,
            replies_count: t.replies_count,
            sticky: t.sticky?,
            locked: t.locked?,
            updated_on: t.updated_on
          }
        end
      }
    end
  end
end
