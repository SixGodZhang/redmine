# frozen_string_literal: true

class KanbanColumn < ApplicationRecord
  belongs_to :kanban_board
  belongs_to :target_status, class_name: 'IssueStatus', foreign_key: :target_status_id

  validates :name, presence: true, length: { maximum: 60 }

  def status_ids
    raw = self[:status_ids]
    ids = raw.is_a?(Array) ? raw : JSON.parse(raw.presence || '[]')
    Array(ids).map(&:to_i).uniq
  rescue JSON::ParserError
    []
  end

  def status_ids=(ids)
    self[:status_ids] = Array(ids).map(&:to_i).reject(&:zero?).uniq.to_json
  end
end
